from __future__ import annotations

import json
import os
from dataclasses import dataclass
from pathlib import Path

import torch
from sklearn.model_selection import train_test_split
from torch.utils.data import DataLoader, Dataset, Subset, WeightedRandomSampler
from torchvision import datasets, transforms

from augmentation import AugmentConfig, build_train_transform, build_val_transform
from metrics_util import (
    class_counts_from_samples,
    compute_class_weights,
    sample_weights_from_labels,
)


def _env_bool(name: str, default: bool) -> bool:
    raw = os.getenv(name)
    if raw is None:
        return default
    return raw.strip().lower() in ("1", "true", "yes", "on")


def build_transforms(
    image_size: int,
    augment: AugmentConfig | None = None,
) -> tuple[transforms.Compose, transforms.Compose]:
    cfg = augment if augment is not None else AugmentConfig.from_env()
    return build_train_transform(image_size, cfg), build_val_transform(image_size)


class TransformSubset(Dataset):
    def __init__(self, subset: Subset, transform):
        self.subset = subset
        self.transform = transform

    def __len__(self) -> int:
        return len(self.subset)

    def __getitem__(self, index: int):
        image, label = self.subset[index]
        return self.transform(image), label


@dataclass
class DataBundle:
    train_loader: DataLoader
    val_loader: DataLoader
    class_names: list[str]
    augment: AugmentConfig
    class_weights: torch.Tensor
    train_counts: torch.Tensor
    val_counts: torch.Tensor


def create_dataloaders(
    data_dir: Path,
    image_size: int,
    batch_size: int,
    val_ratio: float,
    num_workers: int,
    seed: int,
    augment: AugmentConfig | None = None,
    use_weighted_sampler: bool | None = None,
) -> DataBundle:
    if not data_dir.is_dir():
        raise FileNotFoundError(f"Dataset directory not found: {data_dir}")

    weight_power = float(os.getenv("CLASS_WEIGHT_POWER", "0.5"))
    use_sampler = use_weighted_sampler if use_weighted_sampler is not None else _env_bool(
        "USE_WEIGHTED_SAMPLER", False
    )
    cfg = augment if augment is not None else AugmentConfig.from_env()
    base = datasets.ImageFolder(root=str(data_dir))
    class_names = base.classes
    num_classes = len(class_names)

    indices = list(range(len(base)))
    labels = [label for _, label in base.samples]
    train_idx, val_idx = train_test_split(
        indices,
        test_size=val_ratio,
        random_state=seed,
        stratify=labels,
    )

    train_samples = [base.samples[i] for i in train_idx]
    val_samples = [base.samples[i] for i in val_idx]
    train_counts = class_counts_from_samples(train_samples, num_classes)
    val_counts = class_counts_from_samples(val_samples, num_classes)
    class_weights = compute_class_weights(
        class_counts_from_samples(base.samples, num_classes),
        power=weight_power,
    )

    train_tf, val_tf = build_transforms(image_size, cfg)
    train_set = TransformSubset(Subset(base, train_idx), train_tf)
    val_set = TransformSubset(Subset(base, val_idx), val_tf)

    if use_sampler:
        train_labels = [label for _, label in train_samples]
        per_sample_weight = sample_weights_from_labels(train_labels, train_counts, power=weight_power)
        sampler = WeightedRandomSampler(
            weights=per_sample_weight,
            num_samples=len(per_sample_weight),
            replacement=True,
        )
        train_loader = DataLoader(
            train_set,
            batch_size=batch_size,
            sampler=sampler,
            num_workers=num_workers,
            pin_memory=torch.cuda.is_available(),
        )
    else:
        train_loader = DataLoader(
            train_set,
            batch_size=batch_size,
            shuffle=True,
            num_workers=num_workers,
            pin_memory=torch.cuda.is_available(),
        )

    val_loader = DataLoader(
        val_set,
        batch_size=batch_size,
        shuffle=False,
        num_workers=num_workers,
        pin_memory=torch.cuda.is_available(),
    )

    return DataBundle(
        train_loader=train_loader,
        val_loader=val_loader,
        class_names=class_names,
        augment=cfg,
        class_weights=class_weights,
        train_counts=train_counts,
        val_counts=val_counts,
    )


def save_class_names(output_dir: Path, class_names: list[str]) -> None:
    output_dir.mkdir(parents=True, exist_ok=True)
    (output_dir / "classes.json").write_text(
        json.dumps(class_names, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )
