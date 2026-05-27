from __future__ import annotations

import base64
import io
import os

import matplotlib

matplotlib.use("Agg")
import matplotlib.pyplot as plt
import numpy as np
import shap
import torch
import torch.nn as nn
from lime import lime_image
from PIL import Image

CLASS_NAMES = ("Unhealthy", "Healthy")


def explain_enabled() -> bool:
    value = os.getenv("EXPLAIN_ON_INFERENCE", "true").strip().lower()
    return value in {"1", "true", "yes", "on"}


def lime_num_samples() -> int:
    return max(50, int(os.getenv("LIME_NUM_SAMPLES", "150")))


def lime_num_features() -> int:
    return max(4, int(os.getenv("LIME_NUM_FEATURES", "8")))


def shap_background_size() -> int:
    return max(4, int(os.getenv("SHAP_BACKGROUND", "8")))


def tensor_to_uint8(tensor: torch.Tensor) -> np.ndarray:
    mean = np.array([0.485, 0.456, 0.406], dtype=np.float32)
    std = np.array([0.229, 0.224, 0.225], dtype=np.float32)
    arr = tensor.detach().cpu().numpy().transpose(1, 2, 0)
    arr = np.clip(arr * std + mean, 0, 1)
    return (arr * 255).astype(np.uint8)


def predict_proba_batch(
    model: nn.Module,
    images_uint8: list[np.ndarray],
    transform,
    device: torch.device,
) -> np.ndarray:
    tensors = [transform(image=img)["image"] for img in images_uint8]
    batch = torch.stack(tensors).to(device)
    with torch.no_grad():
        logits = model(batch).squeeze(1)
        probs_healthy = torch.sigmoid(logits).cpu().numpy()
    return np.stack([1 - probs_healthy, probs_healthy], axis=1)


def make_lime_fn(model: nn.Module, transform, device: torch.device):
    def fn(images: np.ndarray) -> np.ndarray:
        return predict_proba_batch(model, list(images), transform, device)

    return fn


def build_noise_background(transform, img_size: int, count: int, device: torch.device) -> torch.Tensor:
    tensors = []
    for seed in range(count):
        rng = np.random.default_rng(seed)
        noise = rng.integers(0, 256, size=(img_size, img_size, 3), dtype=np.uint8)
        tensors.append(transform(image=noise)["image"])
    return torch.stack(tensors).to(device)


class BinaryWrapper(nn.Module):
    def __init__(self, base: nn.Module):
        super().__init__()
        self.base = base

    def forward(self, x: torch.Tensor) -> torch.Tensor:
        logit = self.base(x).squeeze(1)
        prob = torch.sigmoid(logit)
        return torch.stack([1 - prob, prob], dim=1)


def _figure_to_png_base64(fig) -> str:
    buffer = io.BytesIO()
    fig.savefig(buffer, format="png", dpi=130, bbox_inches="tight")
    plt.close(fig)
    return base64.b64encode(buffer.getvalue()).decode("ascii")


def render_shap_png_base64(
    model: nn.Module,
    tensor: torch.Tensor,
    image_uint8: np.ndarray,
    background: torch.Tensor,
    pred_idx: int,
    pred_name: str,
    device: torch.device,
) -> str:
    wrapped = BinaryWrapper(model).eval().to(device)
    inp = tensor.unsqueeze(0).to(device).requires_grad_(True)

    explainer = shap.GradientExplainer(wrapped, background)
    shap_values = explainer.shap_values(inp)

    if isinstance(shap_values, list):
        sv = shap_values[pred_idx][0]
    elif isinstance(shap_values, np.ndarray):
        if shap_values.ndim == 5:
            sv = shap_values[0, :, :, :, pred_idx]
        else:
            sv = shap_values[0]
    else:
        sv = np.array(shap_values)

    sv_mean = np.abs(sv).mean(axis=0)
    sv_norm = sv_mean / (sv_mean.max() + 1e-8)

    h_shap, w_shap = sv_norm.shape
    display_img = np.array(
        Image.fromarray(image_uint8).resize((w_shap, h_shap), Image.BILINEAR)
    )

    fig, axes = plt.subplots(1, 3, figsize=(15, 5))
    axes[0].imshow(display_img)
    axes[0].set_title("Исходное", fontsize=10)
    axes[0].axis("off")

    im = axes[1].imshow(sv_norm, cmap="hot")
    axes[1].set_title(f"SHAP heatmap\n{pred_name}", fontsize=10)
    axes[1].axis("off")
    fig.colorbar(im, ax=axes[1], fraction=0.046)

    overlay = display_img.astype(np.float32) / 255.0
    heatmap_rgb = plt.cm.hot(sv_norm)[..., :3]
    blended = np.clip(overlay * 0.55 + heatmap_rgb * 0.45, 0, 1)
    axes[2].imshow(blended)
    axes[2].set_title("SHAP overlay", fontsize=10)
    axes[2].axis("off")

    fig.tight_layout()
    return _figure_to_png_base64(fig)


def render_lime_png_base64(
    image_uint8: np.ndarray,
    predict_fn,
    pred_idx: int,
    pred_name: str,
    img_size: int,
) -> str:
    if image_uint8.shape[0] != img_size or image_uint8.shape[1] != img_size:
        image_uint8 = np.array(
            Image.fromarray(image_uint8).resize((img_size, img_size), Image.BILINEAR)
        )

    explainer = lime_image.LimeImageExplainer()
    explanation = explainer.explain_instance(
        image_uint8,
        predict_fn,
        top_labels=2,
        hide_color=0,
        num_samples=lime_num_samples(),
    )

    _, mask_pos = explanation.get_image_and_mask(
        pred_idx,
        positive_only=True,
        num_features=lime_num_features(),
        hide_rest=False,
    )
    _, mask_neg = explanation.get_image_and_mask(
        pred_idx,
        positive_only=False,
        negative_only=True,
        num_features=lime_num_features(),
        hide_rest=False,
    )

    overlay = image_uint8.astype(np.float32).copy()
    overlay[mask_pos == 1, 1] = np.clip(overlay[mask_pos == 1, 1] * 0.5 + 180, 0, 255)
    overlay[mask_pos == 1, 0] = overlay[mask_pos == 1, 0] * 0.5
    overlay[mask_pos == 1, 2] = overlay[mask_pos == 1, 2] * 0.5
    overlay[mask_neg == 1, 0] = np.clip(overlay[mask_neg == 1, 0] * 0.5 + 180, 0, 255)
    overlay[mask_neg == 1, 1] = overlay[mask_neg == 1, 1] * 0.5
    overlay[mask_neg == 1, 2] = overlay[mask_neg == 1, 2] * 0.5
    overlay = np.clip(overlay, 0, 255).astype(np.uint8)

    fig, axes = plt.subplots(1, 2, figsize=(13, 5))
    axes[0].imshow(image_uint8)
    axes[0].set_title("Исходное", fontsize=10)
    axes[0].axis("off")
    axes[1].imshow(overlay)
    axes[1].set_title(
        f"LIME → {pred_name}\nзелёный = за, красный = против",
        fontsize=10,
    )
    axes[1].axis("off")
    fig.tight_layout()
    return _figure_to_png_base64(fig)


def build_explanations(
    model: nn.Module,
    tensor: torch.Tensor,
    image_uint8: np.ndarray,
    pred_idx: int,
    pred_name: str,
    transform,
    device: torch.device,
    background: torch.Tensor | None,
) -> tuple[str | None, str | None]:
    if not explain_enabled():
        return None, None

    if background is None:
        background = build_noise_background(
            transform,
            image_uint8.shape[0],
            shap_background_size(),
            device,
        )

    predict_fn = make_lime_fn(model, transform, device)
    resized = np.array(
        Image.fromarray(image_uint8).resize((tensor.shape[-1], tensor.shape[-1]), Image.BILINEAR)
    )

    shap_png = render_shap_png_base64(
        model,
        tensor,
        resized,
        background,
        pred_idx,
        pred_name,
        device,
    )
    lime_png = render_lime_png_base64(
        resized,
        predict_fn,
        pred_idx,
        pred_name,
        tensor.shape[-1],
    )
    return shap_png, lime_png
