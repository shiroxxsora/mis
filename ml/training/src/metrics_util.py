from __future__ import annotations

import os

import numpy as np
import torch
import torch.nn as nn
import torch.nn.functional as F
from sklearn.metrics import classification_report, confusion_matrix, f1_score


def class_counts_from_samples(samples: list[tuple[str, int]], num_classes: int) -> torch.Tensor:
    counts = torch.zeros(num_classes, dtype=torch.float32)
    for _, label in samples:
        counts[label] += 1
    return counts


def compute_class_weights(
    counts: torch.Tensor,
    power: float | None = None,
    max_ratio: float | None = None,
) -> torch.Tensor:
    """
    Веса классов для CrossEntropyLoss.

    power=0.5 — sqrt(1/n), мягче чем 1/n.
    max_ratio — ограничение отношения max/min веса.
    """
    if power is None:
        power = float(os.getenv("CLASS_WEIGHT_POWER", "0.5"))
    if max_ratio is None:
        max_ratio = float(os.getenv("CLASS_WEIGHT_MAX_RATIO", "4.0"))

    counts = counts.clamp(min=1.0)
    if power <= 0:
        return torch.ones_like(counts)

    weights = 1.0 / torch.pow(counts, power)
    weights = weights * (len(weights) / weights.sum())

    w_min = weights.min()
    if w_min > 0 and weights.max() / w_min > max_ratio:
        weights = weights.clamp(max=w_min * max_ratio)
        weights = weights * (len(weights) / weights.sum())

    return weights


def sample_weights_from_labels(labels: list[int], counts: torch.Tensor, power: float) -> list[float]:
    class_w = compute_class_weights(counts, power=power)
    return [float(class_w[label]) for label in labels]


def format_weights(class_names: list[str], weights: torch.Tensor) -> str:
    pairs = [f"{name}={weights[i]:.3f}" for i, name in enumerate(class_names)]
    ratio = float(weights.max() / weights.min()) if weights.min() > 0 else 0.0
    return ", ".join(pairs) + f" (max/min={ratio:.2f})"


def majority_baseline_accuracy(counts: torch.Tensor) -> float:
    return float(counts.max() / counts.sum())


@torch.no_grad()
def evaluate_detailed(
    model: nn.Module,
    loader,
    criterion: nn.Module,
    device: torch.device,
    class_names: list[str],
    use_tta: bool = False,
) -> dict:
    """
    Полная оценка модели на loader.

    use_tta=True: усредняем softmax по оригиналу + горизонтальному отражению.
    Loss всегда считается без TTA (по оригинальным логитам) для стабильного early stop.
    """
    model.eval()
    plain_criterion = nn.CrossEntropyLoss()
    running_loss_weighted = 0.0
    running_loss_plain = 0.0
    total = 0
    y_true: list[int] = []
    y_pred: list[int] = []

    for images, labels in loader:
        images = images.to(device)
        labels = labels.to(device)

        logits = model(images)

        running_loss_weighted += criterion(logits, labels).item() * images.size(0)
        running_loss_plain += plain_criterion(logits, labels).item() * images.size(0)
        total += labels.size(0)

        if use_tta:
            # Горизонтальный flip (для OPG рентгена — допустим)
            logits_flip = model(images.flip(-1))
            probs = (F.softmax(logits, dim=1) + F.softmax(logits_flip, dim=1)) / 2.0
            y_pred.extend(probs.argmax(dim=1).cpu().tolist())
        else:
            y_pred.extend(logits.argmax(dim=1).cpu().tolist())

        y_true.extend(labels.cpu().tolist())

    y_true_arr = np.array(y_true)
    y_pred_arr = np.array(y_pred)
    acc = float((y_true_arr == y_pred_arr).mean())
    macro_f1 = float(f1_score(y_true_arr, y_pred_arr, average="macro", zero_division=0))
    weighted_f1 = float(f1_score(y_true_arr, y_pred_arr, average="weighted", zero_division=0))

    return {
        "loss": running_loss_plain / total,
        "loss_weighted": running_loss_weighted / total,
        "acc": acc,
        "macro_f1": macro_f1,
        "weighted_f1": weighted_f1,
        "y_true": y_true_arr,
        "y_pred": y_pred_arr,
        "confusion_matrix": confusion_matrix(y_true_arr, y_pred_arr).tolist(),
        "classification_report": classification_report(
            y_true_arr,
            y_pred_arr,
            target_names=class_names,
            zero_division=0,
        ),
    }


def prediction_distribution(y_pred: np.ndarray, class_names: list[str]) -> dict[str, int]:
    unique, counts = np.unique(y_pred, return_counts=True)
    return {class_names[i]: int(c) for i, c in zip(unique, counts)}
