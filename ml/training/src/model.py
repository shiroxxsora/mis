from __future__ import annotations

import os

import torch.nn as nn
from torchvision import models


class SimpleCnn(nn.Module):
    """CNN + MLP — лёгкая модель, на малом датасете часто залипает на majority class."""

    def __init__(
        self,
        num_classes: int,
        hidden1: int = 128,
        hidden2: int = 64,
        dropout1: float = 0.3,
        dropout2: float = 0.2,
    ):
        super().__init__()
        self.model_backbone = "simple_cnn"
        self.features = nn.Sequential(
            nn.Conv2d(3, 32, kernel_size=3, padding=1),
            nn.BatchNorm2d(32),
            nn.ReLU(inplace=True),
            nn.MaxPool2d(2),
            nn.Conv2d(32, 64, kernel_size=3, padding=1),
            nn.BatchNorm2d(64),
            nn.ReLU(inplace=True),
            nn.MaxPool2d(2),
            nn.Conv2d(64, 128, kernel_size=3, padding=1),
            nn.BatchNorm2d(128),
            nn.ReLU(inplace=True),
            nn.MaxPool2d(2),
            nn.Conv2d(128, 256, kernel_size=3, padding=1),
            nn.BatchNorm2d(256),
            nn.ReLU(inplace=True),
            nn.AdaptiveAvgPool2d(1),
        )
        self.classifier = nn.Sequential(
            nn.Flatten(),
            nn.Linear(256, hidden1),
            nn.ReLU(inplace=True),
            nn.Dropout(dropout1),
            nn.Linear(hidden1, hidden2),
            nn.ReLU(inplace=True),
            nn.Dropout(dropout2),
            nn.Linear(hidden2, num_classes),
        )

    def forward(self, x):
        x = self.features(x)
        return self.classifier(x)


class ResNet18Classifier(nn.Module):
    """Transfer learning — ResNet18, 11M params."""

    def __init__(
        self,
        num_classes: int,
        pretrained: bool = True,
        dropout: float = 0.5,
        hidden: int = 128,
    ):
        super().__init__()
        self.model_backbone = "resnet18"
        weights = models.ResNet18_Weights.IMAGENET1K_V1 if pretrained else None
        encoder = models.resnet18(weights=weights)
        in_features = encoder.fc.in_features  # 512
        encoder.fc = nn.Identity()
        self.encoder = encoder
        self.head = nn.Sequential(
            nn.Linear(in_features, hidden),
            nn.BatchNorm1d(hidden),
            nn.ReLU(inplace=True),
            nn.Dropout(dropout),
            nn.Linear(hidden, num_classes),
        )

    def forward(self, x):
        return self.head(self.encoder(x))


class ResNet50Classifier(nn.Module):
    """Transfer learning — ResNet50, 25M params. Лучше ResNet18, но требует больше данных."""

    def __init__(
        self,
        num_classes: int,
        pretrained: bool = True,
        dropout: float = 0.5,
        hidden: int = 256,
    ):
        super().__init__()
        self.model_backbone = "resnet50"
        weights = models.ResNet50_Weights.IMAGENET1K_V1 if pretrained else None
        encoder = models.resnet50(weights=weights)
        in_features = encoder.fc.in_features  # 2048
        encoder.fc = nn.Identity()
        self.encoder = encoder
        self.head = nn.Sequential(
            nn.Linear(in_features, hidden),
            nn.BatchNorm1d(hidden),
            nn.ReLU(inplace=True),
            nn.Dropout(dropout),
            nn.Linear(hidden, num_classes),
        )

    def forward(self, x):
        return self.head(self.encoder(x))


class EfficientNetB0Classifier(nn.Module):
    """
    EfficientNet-B0 — 5.3M params, лучше ResNet18 на малых датасетах.
    Рекомендуется для OPG (~500 снимков).
    """

    def __init__(
        self,
        num_classes: int,
        pretrained: bool = True,
        dropout: float = 0.4,
        hidden: int = 256,
    ):
        super().__init__()
        self.model_backbone = "efficientnet_b0"
        weights = models.EfficientNet_B0_Weights.IMAGENET1K_V1 if pretrained else None
        net = models.efficientnet_b0(weights=weights)
        in_features = net.classifier[1].in_features  # 1280
        net.classifier = nn.Identity()
        self.encoder = net
        self.head = nn.Sequential(
            nn.Linear(in_features, hidden),
            nn.BatchNorm1d(hidden),
            nn.ReLU(inplace=True),
            nn.Dropout(dropout),
            nn.Linear(hidden, num_classes),
        )

    def forward(self, x):
        return self.head(self.encoder(x))


class EfficientNetB2Classifier(nn.Module):
    """
    EfficientNet-B2 — 9.1M params, нативный размер 260×260.
    Чуть сильнее B0, использовать с IMAGE_SIZE=260.
    """

    def __init__(
        self,
        num_classes: int,
        pretrained: bool = True,
        dropout: float = 0.4,
        hidden: int = 256,
    ):
        super().__init__()
        self.model_backbone = "efficientnet_b2"
        weights = models.EfficientNet_B2_Weights.IMAGENET1K_V1 if pretrained else None
        net = models.efficientnet_b2(weights=weights)
        in_features = net.classifier[1].in_features  # 1408
        net.classifier = nn.Identity()
        self.encoder = net
        self.head = nn.Sequential(
            nn.Linear(in_features, hidden),
            nn.BatchNorm1d(hidden),
            nn.ReLU(inplace=True),
            nn.Dropout(dropout),
            nn.Linear(hidden, num_classes),
        )

    def forward(self, x):
        return self.head(self.encoder(x))


def create_model(num_classes: int, backbone: str | None = None, pretrained: bool | None = None) -> nn.Module:
    name = (backbone or os.getenv("MODEL_BACKBONE", "efficientnet_b0")).strip().lower()
    if pretrained is None:
        pretrained = os.getenv("PRETRAINED", "true").strip().lower() in ("1", "true", "yes", "on")

    if name in ("simple", "simple_cnn", "cnn"):
        return SimpleCnn(num_classes)
    if name in ("resnet18", "resnet"):
        return ResNet18Classifier(num_classes, pretrained=pretrained)
    if name == "resnet50":
        return ResNet50Classifier(num_classes, pretrained=pretrained)
    if name in ("efficientnet_b0", "efficientnet", "eff_b0"):
        return EfficientNetB0Classifier(num_classes, pretrained=pretrained)
    if name in ("efficientnet_b2", "eff_b2"):
        return EfficientNetB2Classifier(num_classes, pretrained=pretrained)
    raise ValueError(
        f"Unknown MODEL_BACKBONE: {name}. "
        "Use: resnet18, resnet50, efficientnet_b0, efficientnet_b2, simple_cnn."
    )


def optimizer_param_groups(
    model: nn.Module,
    lr: float,
    backbone_lr_ratio: float,
) -> list[dict]:
    """Меньший LR для предобученного encoder, обычный для head."""
    if not hasattr(model, "encoder") or not hasattr(model, "head"):
        return [{"params": model.parameters(), "lr": lr}]
    return [
        {"params": model.encoder.parameters(), "lr": lr * backbone_lr_ratio, "name": "encoder"},
        {"params": model.head.parameters(), "lr": lr, "name": "head"},
    ]
