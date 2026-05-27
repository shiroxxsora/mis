"""Инференс DentalNet для кропов зубов (используется также в recognition-service)."""
from __future__ import annotations

import base64
import io
from pathlib import Path

import albumentations as A
import numpy as np
import torch
from albumentations.pytorch import ToTensorV2
from PIL import Image

from model import DentalNet, DentalNetConfig

CLASS_NAMES = ("Unhealthy", "Healthy")


def load_checkpoint(path: Path, device: torch.device | None = None):
    dev = device or torch.device("cpu")
    ckpt = torch.load(path, map_location="cpu")
    cfg: DentalNetConfig = ckpt["cfg"]
    img_size: int = int(ckpt["img_size"])
    model = DentalNet(cfg).to(dev)
    model.load_state_dict(ckpt["state_dict"])
    model.eval()
    transform = A.Compose(
        [
            A.Resize(img_size, img_size),
            A.Normalize(mean=[0.485, 0.456, 0.406], std=[0.229, 0.224, 0.225]),
            ToTensorV2(),
        ]
    )
    return model, img_size, transform, dev


@torch.no_grad()
def predict_image(
    model: torch.nn.Module,
    transform,
    image: Image.Image,
    device: torch.device,
) -> tuple[str, float, float]:
    arr = np.array(image.convert("RGB"))
    tensor = transform(image=arr)["image"].unsqueeze(0).to(device)
    prob_healthy = float(torch.sigmoid(model(tensor).squeeze()).item())
    label = CLASS_NAMES[1] if prob_healthy >= 0.5 else CLASS_NAMES[0]
    confidence = prob_healthy if label == CLASS_NAMES[1] else 1.0 - prob_healthy
    return label, confidence, prob_healthy


def decode_base64_payload(payload: str) -> Image.Image:
    raw = payload.strip()
    if raw.startswith("data:"):
        _, _, raw = raw.partition(",")
    data = base64.b64decode(raw, validate=True)
    return Image.open(io.BytesIO(data)).convert("RGB")
