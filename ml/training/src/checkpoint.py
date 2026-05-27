from __future__ import annotations

import json
from pathlib import Path

import torch
import torch.nn as nn

from model import create_model


def load_checkpoint(
    checkpoint_path: Path,
    device: torch.device,
) -> tuple[nn.Module, list[str], int]:
    """Загружает supervised-чекпойнт (torchvision-модели)."""
    if not checkpoint_path.is_file():
        raise FileNotFoundError(f"Checkpoint not found: {checkpoint_path}")

    checkpoint = torch.load(checkpoint_path, map_location=device, weights_only=False)
    class_names: list[str] = checkpoint["class_names"]
    image_size: int = int(checkpoint.get("image_size", 224))
    backbone: str = checkpoint.get("model_backbone", "simple_cnn")

    model = create_model(len(class_names), backbone=backbone, pretrained=False)
    model.load_state_dict(checkpoint["model_state_dict"])
    model.to(device)
    model.eval()

    return model, class_names, image_size


def load_mt_checkpoint(
    checkpoint_path: Path,
    device: torch.device,
) -> tuple[nn.Module, list[str], int]:
    """Загружает Mean Teacher чекпойнт (timm-модели)."""
    import timm

    if not checkpoint_path.is_file():
        raise FileNotFoundError(f"MT checkpoint not found: {checkpoint_path}")

    checkpoint = torch.load(checkpoint_path, map_location=device, weights_only=False)
    class_names: list[str] = checkpoint["class_names"]
    image_size: int = int(checkpoint.get("image_size", 224))
    model_name: str = checkpoint.get("model_name", "efficientnet_b0")

    model = timm.create_model(model_name, pretrained=False)
    in_features = model.classifier.in_features
    model.classifier = nn.Linear(in_features, len(class_names))
    model.load_state_dict(checkpoint["model_state_dict"])
    model.to(device)
    model.eval()
    # Метка для совместимости с GradCAM-диспетчером
    model.model_backbone = f"timm_{model_name}"

    return model, class_names, image_size


def auto_load_checkpoint(
    checkpoint_path: Path,
    device: torch.device,
) -> tuple[nn.Module, list[str], int]:
    """Автоматически определяет тип чекпойнта и загружает нужную функцию."""
    if not checkpoint_path.is_file():
        raise FileNotFoundError(f"Checkpoint not found: {checkpoint_path}")

    meta = torch.load(checkpoint_path, map_location="cpu", weights_only=False)
    if "model_name" in meta and "model_backbone" not in meta:
        return load_mt_checkpoint(checkpoint_path, device)
    return load_checkpoint(checkpoint_path, device)


def load_class_names(output_dir: Path) -> list[str]:
    path = output_dir / "classes.json"
    if path.is_file():
        return json.loads(path.read_text(encoding="utf-8"))
    raise FileNotFoundError(f"classes.json not found in {output_dir}")
