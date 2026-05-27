from __future__ import annotations

import os
import random
from dataclasses import dataclass

import torch
import numpy as np
from torchvision import transforms

IMAGENET_MEAN = (0.485, 0.456, 0.406)
IMAGENET_STD = (0.229, 0.224, 0.225)


def _env_bool(name: str, default: bool) -> bool:
    raw = os.getenv(name)
    if raw is None:
        return default
    return raw.strip().lower() in ("1", "true", "yes", "on")


class GaussianNoise:
    """Добавляет гауссов шум к тензору (работает после ToTensor)."""

    def __init__(self, std: float = 0.02, p: float = 0.3):
        self.std = std
        self.p = p

    def __call__(self, tensor: torch.Tensor) -> torch.Tensor:
        if random.random() < self.p:
            return tensor + torch.randn_like(tensor) * self.std
        return tensor

    def __repr__(self) -> str:
        return f"GaussianNoise(std={self.std}, p={self.p})"


class RandomGamma:
    """Gamma-коррекция: усиливает/ослабляет контраст в тёмных/светлых участках."""

    def __init__(self, gamma_range: tuple[float, float] = (0.7, 1.4), p: float = 0.4):
        self.gamma_range = gamma_range
        self.p = p

    def __call__(self, img):
        if random.random() < self.p:
            from PIL import Image
            import numpy as np
            gamma = random.uniform(*self.gamma_range)
            arr = np.array(img).astype(np.float32) / 255.0
            arr = np.clip(arr ** gamma, 0, 1)
            return Image.fromarray((arr * 255).astype(np.uint8))
        return img

    def __repr__(self) -> str:
        return f"RandomGamma(range={self.gamma_range}, p={self.p})"


@dataclass
class AugmentConfig:
    """Параметры аугментации train-выборки (OPG / рентген).
    Defaults соответствуют from_env() defaults — не расходятся."""

    enabled: bool = True
    horizontal_flip: float = 0.5
    rotation_degrees: float = 8.0
    translate: float = 0.04
    scale_min: float = 0.95
    scale_max: float = 1.05
    shear_degrees: float = 3.0
    brightness: float = 0.15
    contrast: float = 0.2
    blur_probability: float = 0.15
    random_erasing: bool = False
    erasing_probability: float = 0.08
    # X-ray специфичные
    equalize_probability: float = 0.3
    autocontrast_probability: float = 0.2
    gamma_probability: float = 0.4
    noise_probability: float = 0.3
    noise_std: float = 0.02

    @classmethod
    def from_env(cls) -> AugmentConfig:
        return cls(
            enabled=_env_bool("AUGMENT_ENABLED", True),
            horizontal_flip=float(os.getenv("AUGMENT_HFLIP", "0.5")),
            rotation_degrees=float(os.getenv("AUGMENT_ROTATION", "8")),
            translate=float(os.getenv("AUGMENT_TRANSLATE", "0.04")),
            scale_min=float(os.getenv("AUGMENT_SCALE_MIN", "0.95")),
            scale_max=float(os.getenv("AUGMENT_SCALE_MAX", "1.05")),
            shear_degrees=float(os.getenv("AUGMENT_SHEAR", "3")),
            brightness=float(os.getenv("AUGMENT_BRIGHTNESS", "0.15")),
            contrast=float(os.getenv("AUGMENT_CONTRAST", "0.2")),
            blur_probability=float(os.getenv("AUGMENT_BLUR_P", "0.15")),
            random_erasing=_env_bool("AUGMENT_RANDOM_ERASING", False),
            erasing_probability=float(os.getenv("AUGMENT_ERASING_P", "0.08")),
            equalize_probability=float(os.getenv("AUGMENT_EQUALIZE_P", "0.3")),
            autocontrast_probability=float(os.getenv("AUGMENT_AUTOCONTRAST_P", "0.2")),
            gamma_probability=float(os.getenv("AUGMENT_GAMMA_P", "0.4")),
            noise_probability=float(os.getenv("AUGMENT_NOISE_P", "0.3")),
            noise_std=float(os.getenv("AUGMENT_NOISE_STD", "0.02")),
        )

    def summary(self) -> str:
        if not self.enabled:
            return "augmentation=disabled"
        return (
            f"augmentation=on flip={self.horizontal_flip} rot=±{self.rotation_degrees}° "
            f"affine(scale {self.scale_min}-{self.scale_max}) "
            f"jitter(brightness={self.brightness}, contrast={self.contrast}) "
            f"equalize_p={self.equalize_probability} gamma_p={self.gamma_probability} "
            f"noise_p={self.noise_probability} blur_p={self.blur_probability} "
            f"erasing={self.random_erasing}"
        )


def build_val_transform(image_size: int) -> transforms.Compose:
    return transforms.Compose([
        transforms.Grayscale(num_output_channels=3),
        transforms.Resize((image_size, image_size)),
        transforms.ToTensor(),
        transforms.Normalize(IMAGENET_MEAN, IMAGENET_STD),
    ])


def build_train_transform(image_size: int, config: AugmentConfig | None = None) -> transforms.Compose:
    cfg = config or AugmentConfig.from_env()
    normalize = transforms.Normalize(IMAGENET_MEAN, IMAGENET_STD)

    if not cfg.enabled:
        return build_val_transform(image_size)

    # Чуть больше кадр → RandomCrop даёт масштаб/сдвиг без отдельного resize-crop хака
    resize = int(image_size * 1.12)

    # PIL-трансформы (до ToTensor)
    pil_steps: list = [
        transforms.Grayscale(num_output_channels=3),
        transforms.Resize((resize, resize)),
        transforms.RandomHorizontalFlip(p=cfg.horizontal_flip),
        transforms.RandomRotation(degrees=cfg.rotation_degrees),
        transforms.RandomAffine(
            degrees=0,
            translate=(cfg.translate, cfg.translate),
            scale=(cfg.scale_min, cfg.scale_max),
            shear=(-cfg.shear_degrees, cfg.shear_degrees),
        ),
        transforms.ColorJitter(
            brightness=cfg.brightness,
            contrast=cfg.contrast,
            saturation=0.0,
            hue=0.0,
        ),
    ]

    # X-ray контрастирование (до RandomCrop — на полном снимке)
    if cfg.equalize_probability > 0:
        pil_steps.append(transforms.RandomEqualize(p=cfg.equalize_probability))
    if cfg.autocontrast_probability > 0:
        pil_steps.append(transforms.RandomAutocontrast(p=cfg.autocontrast_probability))
    if cfg.gamma_probability > 0:
        pil_steps.append(RandomGamma(p=cfg.gamma_probability))

    if cfg.blur_probability > 0:
        pil_steps.append(
            transforms.RandomApply(
                [transforms.GaussianBlur(kernel_size=3, sigma=(0.1, 1.2))],
                p=cfg.blur_probability,
            )
        )

    pil_steps.append(transforms.RandomCrop(image_size))
    pil_steps.append(transforms.ToTensor())

    # Тензорные трансформы (после ToTensor)
    tensor_steps: list = []
    if cfg.noise_probability > 0:
        tensor_steps.append(GaussianNoise(std=cfg.noise_std, p=cfg.noise_probability))
    if cfg.random_erasing:
        tensor_steps.append(
            transforms.RandomErasing(
                p=cfg.erasing_probability,
                scale=(0.02, 0.1),
                ratio=(0.3, 3.3),
                value="random",
            )
        )
    tensor_steps.append(normalize)

    return transforms.Compose(pil_steps + tensor_steps)
