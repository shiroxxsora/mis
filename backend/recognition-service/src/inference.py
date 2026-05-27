from __future__ import annotations

import base64
import io
import os
from dataclasses import dataclass
from pathlib import Path

import albumentations as A
import numpy as np
import torch
from albumentations.pytorch import ToTensorV2
from PIL import Image

from explain_runtime import build_explanations, build_noise_background, shap_background_size
from model import DentalNet, DentalNetConfig

CLASS_NAMES = ("Unhealthy", "Healthy")
MAX_DECODED_IMAGE_BYTES = 10 * 1024 * 1024


def _trusted_model_root() -> Path:
    explicit = os.getenv("MODEL_PATH")
    if explicit:
        return Path(explicit).resolve().parent
    return Path(os.getenv("OUTPUT_DIR", "/models")).resolve()


@dataclass(frozen=True)
class Prediction:
    label: str
    confidence: float
    prob_healthy: float


@dataclass(frozen=True)
class PredictionWithExplain(Prediction):
    shap_image_base64: str | None = None
    lime_image_base64: str | None = None


class DentalNetInference:
    def __init__(self, checkpoint_path: Path, device: str | None = None):
        if not checkpoint_path.is_file():
            raise FileNotFoundError(f"Checkpoint not found: {checkpoint_path}")

        resolved = checkpoint_path.resolve()
        trusted_root = _trusted_model_root().resolve()
        if trusted_root not in resolved.parents and resolved != trusted_root:
            raise ValueError(f"Checkpoint must be inside trusted model directory: {trusted_root}")

        resolved_device = device or os.getenv("DEVICE", "cpu")
        self.device = torch.device(resolved_device)

        ckpt = torch.load(resolved, map_location="cpu", weights_only=False)
        cfg: DentalNetConfig = ckpt["cfg"]
        self.img_size: int = int(ckpt["img_size"])

        self.model = DentalNet(cfg).to(self.device)
        self.model.load_state_dict(ckpt["state_dict"])
        self.model.eval()

        self.transform = A.Compose(
            [
                A.Resize(self.img_size, self.img_size),
                A.Normalize(mean=[0.485, 0.456, 0.406], std=[0.229, 0.224, 0.225]),
                ToTensorV2(),
            ]
        )
        self._shap_background: torch.Tensor | None = None

    @staticmethod
    def decode_image_payload(payload: str) -> Image.Image:
        raw = payload.strip()
        if raw.startswith("data:"):
            _, _, raw = raw.partition(",")
        try:
            data = base64.b64decode(raw, validate=True)
        except Exception as exc:
            raise ValueError("payload must be a base64-encoded tooth image") from exc
        if len(data) > MAX_DECODED_IMAGE_BYTES:
            raise ValueError(
                f"image payload exceeds {MAX_DECODED_IMAGE_BYTES // (1024 * 1024)} MB limit"
            )
        if not data:
            raise ValueError("empty image payload")
        return Image.open(io.BytesIO(data)).convert("RGB")

    def predict_image(self, image: Image.Image) -> PredictionWithExplain:
        arr = np.array(image)
        tensor = self.transform(image=arr)["image"]
        with torch.no_grad():
            batch = tensor.unsqueeze(0).to(self.device)
            logit = self.model(batch).squeeze()
            prob_healthy = float(torch.sigmoid(logit).item())
        pred_idx = 1 if prob_healthy >= 0.5 else 0
        label = CLASS_NAMES[pred_idx]
        confidence = prob_healthy if pred_idx == 1 else 1.0 - prob_healthy

        image_uint8 = np.array(
            image.resize((self.img_size, self.img_size), Image.BILINEAR)
        )
        shap_png: str | None = None
        lime_png: str | None = None
        try:
            shap_png, lime_png = build_explanations(
                self.model,
                tensor,
                image_uint8,
                pred_idx,
                label,
                self.transform,
                self.device,
                self._get_shap_background(),
            )
        except Exception as exc:
            print(f"[recognition] explain failed: {exc}")

        return PredictionWithExplain(
            label=label,
            confidence=confidence,
            prob_healthy=prob_healthy,
            shap_image_base64=shap_png,
            lime_image_base64=lime_png,
        )

    def _get_shap_background(self) -> torch.Tensor | None:
        if self._shap_background is None:
            self._shap_background = build_noise_background(
                self.transform,
                self.img_size,
                shap_background_size(),
                self.device,
            )
        return self._shap_background

    def predict_payload(self, payload: str) -> PredictionWithExplain:
        return self.predict_image(self.decode_image_payload(payload))
