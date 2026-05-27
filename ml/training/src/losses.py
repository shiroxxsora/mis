from __future__ import annotations

import os

import torch
import torch.nn as nn
import torch.nn.functional as F


class FocalLoss(nn.Module):
    """
    Focal Loss для дисбаланса классов.
    FL = -alpha * (1 - p_t)^gamma * log(p_t)
    """

    def __init__(
        self,
        weight: torch.Tensor | None = None,
        gamma: float = 2.0,
        label_smoothing: float = 0.0,
    ):
        super().__init__()
        self.register_buffer("weight", weight if weight is not None else None)
        self.gamma = gamma
        self.label_smoothing = label_smoothing

    def forward(self, inputs: torch.Tensor, targets: torch.Tensor) -> torch.Tensor:
        ce = F.cross_entropy(
            inputs,
            targets,
            weight=self.weight,
            reduction="none",
            label_smoothing=self.label_smoothing,
        )
        pt = torch.exp(-ce)
        focal = ((1.0 - pt) ** self.gamma) * ce
        return focal.mean()


def build_criterion(
    loss_type: str,
    class_weights: torch.Tensor | None,
    device: torch.device,
    label_smoothing: float = 0.0,
    focal_gamma: float = 2.0,
) -> nn.Module:
    """
    LOSS_TYPE:
      - cross_entropy — nn.CrossEntropyLoss (по умолчанию)
      - focal — FocalLoss
    class_weights: None если USE_CLASS_WEIGHTS=false
    """
    weight = class_weights.to(device) if class_weights is not None else None
    loss_type = loss_type.strip().lower()

    if loss_type in ("cross_entropy", "ce", "crossentropy"):
        criterion = nn.CrossEntropyLoss(weight=weight, label_smoothing=label_smoothing)
        desc = "CrossEntropyLoss"
    elif loss_type == "focal":
        criterion = FocalLoss(
            weight=weight,
            gamma=focal_gamma,
            label_smoothing=label_smoothing,
        )
        desc = f"FocalLoss(gamma={focal_gamma})"
    else:
        raise ValueError(f"Unknown LOSS_TYPE: {loss_type}. Use cross_entropy or focal.")

    parts = [desc]
    if weight is not None:
        parts.append("weighted")
    if label_smoothing > 0:
        parts.append(f"label_smoothing={label_smoothing}")
    criterion.description = ", ".join(parts)  # type: ignore[attr-defined]
    return criterion


def build_criterion_from_env(
    class_weights: torch.Tensor | None,
    device: torch.device,
) -> nn.Module:
    loss_type = os.getenv("LOSS_TYPE", "cross_entropy")
    label_smoothing = float(os.getenv("LABEL_SMOOTHING", "0"))
    focal_gamma = float(os.getenv("FOCAL_GAMMA", "2.0"))
    return build_criterion(
        loss_type=loss_type,
        class_weights=class_weights,
        device=device,
        label_smoothing=label_smoothing,
        focal_gamma=focal_gamma,
    )
