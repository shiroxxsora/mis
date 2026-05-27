from __future__ import annotations

import numpy as np
import torch
from PIL import Image
from torchvision import transforms


def tensor_to_uint8(image_tensor: torch.Tensor) -> np.ndarray:
    """CHW normalized tensor -> HWC uint8 RGB."""
    mean = np.array([0.485, 0.456, 0.406], dtype=np.float32)
    std = np.array([0.229, 0.224, 0.225], dtype=np.float32)
    img = image_tensor.detach().cpu().numpy().transpose(1, 2, 0)
    img = np.clip(img * std + mean, 0.0, 1.0)
    return (img * 255).astype(np.uint8)


@torch.no_grad()
def predict_proba(
    model: torch.nn.Module,
    images_uint8: list[np.ndarray],
    transform: transforms.Compose,
    device: torch.device,
) -> np.ndarray:
    """images_uint8: список массивов H×W×3 (RGB, 0–255)."""
    batch = []
    for arr in images_uint8:
        pil = Image.fromarray(arr.astype(np.uint8))
        batch.append(transform(pil))
    tensor = torch.stack(batch).to(device)
    logits = model(tensor)
    return torch.softmax(logits, dim=1).cpu().numpy()


def make_lime_predict_fn(
    model: torch.nn.Module,
    transform: transforms.Compose,
    device: torch.device,
):
    def predict_fn(images: np.ndarray) -> np.ndarray:
        # LIME передаёт (N, H, W, 3)
        if images.ndim == 3:
            images = images[np.newaxis, ...]
        batch = [images[i] for i in range(images.shape[0])]
        return predict_proba(model, batch, transform, device)

    return predict_fn
