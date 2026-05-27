from __future__ import annotations

import random

import numpy as np
import torch
import torch.nn as nn


def set_encoder_trainable(model: nn.Module, trainable: bool) -> None:
    if not hasattr(model, "encoder"):
        return
    for param in model.encoder.parameters():
        param.requires_grad = trainable


def set_encoder_bn_eval(model: nn.Module) -> None:
    """При замороженном encoder BatchNorm не обновляет статистику."""
    if not hasattr(model, "encoder"):
        return
    for module in model.encoder.modules():
        if isinstance(module, (nn.BatchNorm2d, nn.BatchNorm1d, nn.SyncBatchNorm)):
            module.eval()


# ── Mixup ──────────────────────────────────────────────────────────────────

def mixup_batch(
    images: torch.Tensor,
    labels: torch.Tensor,
    alpha: float,
) -> tuple[torch.Tensor, torch.Tensor, torch.Tensor | None, float | None]:
    if alpha <= 0 or images.size(0) < 2:
        return images, labels, None, None

    lam = float(torch.distributions.Beta(alpha, alpha).sample().item())
    index = torch.randperm(images.size(0), device=images.device)
    mixed = lam * images + (1.0 - lam) * images[index]
    return mixed, labels, labels[index], lam


# ── CutMix ─────────────────────────────────────────────────────────────────

def _rand_bbox(size: torch.Size, lam: float) -> tuple[int, int, int, int]:
    W, H = size[-1], size[-2]
    cut_ratio = (1.0 - lam) ** 0.5
    cut_w = int(W * cut_ratio)
    cut_h = int(H * cut_ratio)

    cx = random.randint(0, W)
    cy = random.randint(0, H)

    x1 = max(cx - cut_w // 2, 0)
    y1 = max(cy - cut_h // 2, 0)
    x2 = min(cx + cut_w // 2, W)
    y2 = min(cy + cut_h // 2, H)
    return x1, y1, x2, y2


def cutmix_batch(
    images: torch.Tensor,
    labels: torch.Tensor,
    alpha: float,
) -> tuple[torch.Tensor, torch.Tensor, torch.Tensor | None, float | None]:
    if alpha <= 0 or images.size(0) < 2:
        return images, labels, None, None

    lam_raw = float(np.random.beta(alpha, alpha))
    index = torch.randperm(images.size(0), device=images.device)
    x1, y1, x2, y2 = _rand_bbox(images.size(), lam_raw)

    mixed = images.clone()
    mixed[:, :, y1:y2, x1:x2] = images[index, :, y1:y2, x1:x2]

    # Пересчитываем lam по реальной площади вырезанного патча
    W, H = images.size(-1), images.size(-2)
    lam = 1.0 - (x2 - x1) * (y2 - y1) / (W * H)
    return mixed, labels, labels[index], lam


# ── Общая функция loss для Mixup и CutMix ──────────────────────────────────

def mixup_loss(
    criterion: nn.Module,
    outputs: torch.Tensor,
    targets_a: torch.Tensor,
    targets_b: torch.Tensor,
    lam: float,
) -> torch.Tensor:
    return lam * criterion(outputs, targets_a) + (1.0 - lam) * criterion(outputs, targets_b)
