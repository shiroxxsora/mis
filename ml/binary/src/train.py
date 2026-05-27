"""
Обучение DentalNet на кропах отдельных зубов (бинарная классификация).

Env vars:
  CSV_PATH        — путь к dataset.csv (path, label)
  OUTPUT_DIR      — куда сохранять модели и метрики
  IMG_SIZE        — размер входа модели (default 128)
  EPOCHS          — кол-во эпох (default 50)
  BATCH_SIZE      — (default 32)
  DROPOUT_SWEEP   — если true, обучает несколько моделей с разным dropout
  VAL_SPLIT       — доля валидации (default 0.2)
  DEVICE          — cuda / cpu
  SEED            — (default 42)
  + все параметры DentalNetConfig (FILTERS, FC_UNITS, DROPOUT, LEARNING_RATE, ...)
"""
from __future__ import annotations

import json
import os
import random
from pathlib import Path

import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
import numpy as np
import pandas as pd
import torch
import torch.nn as nn
from sklearn.metrics import (
    classification_report, confusion_matrix, roc_auc_score, ConfusionMatrixDisplay
)
from sklearn.model_selection import train_test_split
from torch.utils.data import DataLoader, Dataset, WeightedRandomSampler

import albumentations as A
from albumentations.pytorch import ToTensorV2
from PIL import Image

from model import DentalNet, DentalNetConfig


# ── Seed ───────────────────────────────────────────────────────────────────

def _seed_everything(seed: int) -> None:
    random.seed(seed)
    np.random.seed(seed)
    torch.manual_seed(seed)
    torch.cuda.manual_seed_all(seed)
    torch.backends.cudnn.deterministic = True
    torch.backends.cudnn.benchmark = False


# ── Dataset ────────────────────────────────────────────────────────────────

class ToothDataset(Dataset):
    def __init__(self, paths: list[str], labels: list[int], transform=None):
        self.paths = paths
        self.labels = labels
        self.transform = transform

    def __len__(self) -> int:
        return len(self.paths)

    def __getitem__(self, idx: int):
        img = np.array(Image.open(self.paths[idx]).convert("RGB"))
        if self.transform:
            img = self.transform(image=img)["image"]
        return img, self.labels[idx]


def _get_transforms(img_size: int, is_train: bool):
    if is_train:
        return A.Compose([
            A.Resize(img_size, img_size),
            A.HorizontalFlip(p=0.5),
            A.Rotate(limit=15, p=0.5),
            A.OneOf([
                A.GaussNoise(var_limit=(5, 20), p=1),
                A.GaussianBlur(p=1),
                A.MotionBlur(p=1),
            ], p=0.3),
            A.CLAHE(clip_limit=2.0, p=0.3),
            A.RandomBrightnessContrast(brightness_limit=0.1, contrast_limit=0.1, p=0.3),
            A.Normalize(mean=[0.485, 0.456, 0.406], std=[0.229, 0.224, 0.225]),
            ToTensorV2(),
        ])
    return A.Compose([
        A.Resize(img_size, img_size),
        A.Normalize(mean=[0.485, 0.456, 0.406], std=[0.229, 0.224, 0.225]),
        ToTensorV2(),
    ])


# ── Weighted sampler ───────────────────────────────────────────────────────

def _make_sampler(labels: list[int]) -> WeightedRandomSampler:
    counts = np.bincount(labels)
    weights_per_class = 1.0 / (counts + 1e-6)
    sample_weights = [weights_per_class[l] for l in labels]
    return WeightedRandomSampler(sample_weights, len(sample_weights), replacement=True)


# ── Графики ────────────────────────────────────────────────────────────────

def _save_plots(history: list[dict], labels_arr: np.ndarray, preds: np.ndarray,
                probs: np.ndarray, output_dir: Path, run_name: str) -> None:
    epochs_range = [h["epoch"] for h in history]

    # ── Loss + Accuracy + AUC ──────────────────────────────────────────────
    fig, axes = plt.subplots(1, 3, figsize=(18, 5))
    fig.suptitle(run_name, fontsize=13)

    axes[0].plot(epochs_range, [h["train_loss"] for h in history], label="train")
    axes[0].plot(epochs_range, [h["val_loss"]   for h in history], label="val")
    axes[0].set_title("Loss")
    axes[0].set_xlabel("Epoch")
    axes[0].legend()
    axes[0].grid(True)

    axes[1].plot(epochs_range, [h["acc"] for h in history], color="steelblue")
    axes[1].set_title("Val Accuracy")
    axes[1].set_xlabel("Epoch")
    axes[1].set_ylim(0, 1)
    axes[1].grid(True)

    axes[2].plot(epochs_range, [h["auc"] for h in history], color="darkorange")
    axes[2].set_title("Val ROC-AUC")
    axes[2].set_xlabel("Epoch")
    axes[2].set_ylim(0, 1)
    axes[2].grid(True)

    fig.tight_layout()
    fig.savefig(output_dir / f"{run_name}_curves.png", dpi=130, bbox_inches="tight")
    plt.close(fig)

    # ── Confusion matrix ───────────────────────────────────────────────────
    cm = confusion_matrix(labels_arr, preds)
    fig, ax = plt.subplots(figsize=(5, 4))
    disp = ConfusionMatrixDisplay(cm, display_labels=["Unhealthy", "Healthy"])
    disp.plot(ax=ax, colorbar=False, cmap="Blues")
    ax.set_title(f"Confusion Matrix\n{run_name}", fontsize=11)
    fig.tight_layout()
    fig.savefig(output_dir / f"{run_name}_confusion.png", dpi=130, bbox_inches="tight")
    plt.close(fig)

    print(f"  Графики → {output_dir / run_name}_curves.png / _confusion.png")


def _save_sweep_comparison(results: list[dict], output_dir: Path) -> None:
    """Сводный bar-chart: AUC и Accuracy по всем конфигурациям sweep."""
    names = [r["run"].replace("dentalnet_", "") for r in results]
    aucs  = [r["best_val_auc"] for r in results]
    accs  = [r["final_acc"]    for r in results]

    x = np.arange(len(names))
    fig, axes = plt.subplots(1, 2, figsize=(10, 4))
    fig.suptitle("Dropout Sweep — сравнение", fontsize=13)

    for ax, vals, title, color in zip(
        axes, [aucs, accs], ["Val ROC-AUC", "Val Accuracy"], ["darkorange", "steelblue"]
    ):
        bars = ax.bar(x, vals, color=color, alpha=0.8)
        ax.set_xticks(x)
        ax.set_xticklabels(names)
        ax.set_ylim(0, 1)
        ax.set_title(title)
        ax.grid(axis="y")
        for bar, v in zip(bars, vals):
            ax.text(bar.get_x() + bar.get_width() / 2, bar.get_height() + 0.01,
                    f"{v:.3f}", ha="center", va="bottom", fontsize=9)

    fig.tight_layout()
    fig.savefig(output_dir / "sweep_comparison.png", dpi=130, bbox_inches="tight")
    plt.close(fig)
    print(f"  Sweep comparison → {output_dir / 'sweep_comparison.png'}")


# ── Training loop ──────────────────────────────────────────────────────────

def _train_one(
    train_paths: list[str],
    train_labels: list[int],
    val_paths: list[str],
    val_labels: list[int],
    cfg: DentalNetConfig,
    img_size: int,
    epochs: int,
    batch_size: int,
    device: torch.device,
    output_dir: Path,
    run_name: str,
) -> dict:
    train_ds = ToothDataset(train_paths, train_labels, _get_transforms(img_size, True))
    val_ds   = ToothDataset(val_paths,   val_labels,   _get_transforms(img_size, False))

    sampler    = _make_sampler(train_labels)
    train_loader = DataLoader(train_ds, batch_size=batch_size, sampler=sampler,
                              num_workers=2, pin_memory=True)
    val_loader   = DataLoader(val_ds, batch_size=batch_size, shuffle=False,
                              num_workers=2, pin_memory=True)

    model = DentalNet(cfg).to(device)

    n_healthy   = sum(train_labels)
    n_unhealthy = len(train_labels) - n_healthy
    pos_weight = torch.tensor([n_unhealthy / max(n_healthy, 1)], device=device)
    criterion = nn.BCEWithLogitsLoss(pos_weight=pos_weight)
    optimizer = torch.optim.Adam(model.parameters(), lr=cfg.lr, weight_decay=1e-5)

    scheduler = None
    if cfg.use_scheduler:
        scheduler = torch.optim.lr_scheduler.ReduceLROnPlateau(
            optimizer, mode="min", factor=0.5, patience=5, min_lr=1e-6
        )

    best_auc = 0.0
    best_state = None
    history: list[dict] = []

    for epoch in range(1, epochs + 1):
        # ── train ──
        model.train()
        train_loss = 0.0
        for imgs, lbls in train_loader:
            imgs = imgs.to(device)
            lbls = lbls.float().to(device)
            optimizer.zero_grad()
            logits = model(imgs).squeeze(1)
            loss = criterion(logits, lbls)
            loss.backward()
            optimizer.step()
            train_loss += loss.item() * imgs.size(0)
        train_loss /= len(train_ds)

        # ── validate ──
        model.eval()
        val_loss = 0.0
        all_logits, all_labels = [], []
        with torch.no_grad():
            for imgs, lbls in val_loader:
                imgs = imgs.to(device)
                lbls = lbls.float().to(device)
                logits = model(imgs).squeeze(1)
                val_loss += criterion(logits, lbls).item() * imgs.size(0)
                all_logits.extend(logits.sigmoid().cpu().numpy())
                all_labels.extend(lbls.cpu().numpy())
        val_loss /= len(val_ds)

        probs = np.array(all_logits)
        preds = (probs >= 0.5).astype(int)
        labels_arr = np.array(all_labels, dtype=int)
        acc = (preds == labels_arr).mean()
        try:
            auc = roc_auc_score(labels_arr, probs)
        except Exception:
            auc = 0.0

        if scheduler:
            scheduler.step(val_loss)

        history.append({"epoch": epoch, "train_loss": train_loss, "val_loss": val_loss,
                         "acc": acc, "auc": auc})

        if epoch % 10 == 0 or epoch == 1:
            print(f"  [{run_name}] Epoch {epoch}/{epochs} | "
                  f"train_loss={train_loss:.4f} val_loss={val_loss:.4f} "
                  f"acc={acc:.4f} auc={auc:.4f}")

        if auc > best_auc:
            best_auc = auc
            best_state = {k: v.cpu().clone() for k, v in model.state_dict().items()}

    # ── final eval on best model ──
    model.load_state_dict(best_state)
    model.eval()
    all_logits, all_labels = [], []
    with torch.no_grad():
        for imgs, lbls in val_loader:
            logits = model(imgs.to(device)).squeeze(1)
            all_logits.extend(logits.sigmoid().cpu().numpy())
            all_labels.extend(lbls.numpy())
    probs = np.array(all_logits)
    preds = (probs >= 0.5).astype(int)
    labels_arr = np.array(all_labels, dtype=int)

    final_acc = (preds == labels_arr).mean()
    final_auc = roc_auc_score(labels_arr, probs) if len(np.unique(labels_arr)) > 1 else 0.0
    report = classification_report(labels_arr, preds,
                                   target_names=["Unhealthy", "Healthy"], output_dict=True)

    print(f"\n[{run_name}] Best AUC={best_auc:.4f}  Final Acc={final_acc:.4f}")
    print(classification_report(labels_arr, preds, target_names=["Unhealthy", "Healthy"]))

    _save_plots(history, labels_arr, preds, probs, output_dir, run_name)

    # ── save model ──
    model_path = output_dir / f"{run_name}.pt"
    torch.save({
        "state_dict": best_state,
        "cfg": cfg,
        "img_size": img_size,
    }, model_path)

    metrics = {
        "run": run_name,
        "best_val_auc": float(best_auc),
        "final_acc": float(final_acc),
        "final_auc": float(final_auc),
        "report": report,
        "history": history,
    }
    return metrics


# ── Sweep ──────────────────────────────────────────────────────────────────

def _run_sweep(
    train_paths, train_labels, val_paths, val_labels,
    img_size, epochs, batch_size, device, output_dir, base_cfg,
) -> list[dict]:
    dropouts = [0.2, 0.3, 0.5]
    all_results = []
    for d in dropouts:
        cfg = DentalNetConfig(
            filters=base_cfg.filters,
            fc_units=base_cfg.fc_units,
            dropout=d,
            lr=base_cfg.lr,
            use_attention=base_cfg.use_attention,
            use_scheduler=base_cfg.use_scheduler,
        )
        result = _train_one(
            train_paths, train_labels, val_paths, val_labels,
            cfg, img_size, epochs, batch_size, device,
            output_dir, run_name=f"dentalnet_dropout{d}",
        )
        all_results.append(result)
    return all_results


# ── Main ───────────────────────────────────────────────────────────────────

def main() -> None:
    seed     = int(os.getenv("SEED", "42"))
    csv_path = os.getenv("CSV_PATH", "/data/output/dataset.csv")
    out_dir  = Path(os.getenv("OUTPUT_DIR", "/data/output"))
    img_size = int(os.getenv("IMG_SIZE", "128"))
    epochs   = int(os.getenv("EPOCHS", "50"))
    batch    = int(os.getenv("BATCH_SIZE", "32"))
    sweep    = os.getenv("DROPOUT_SWEEP", "false").lower() in ("1", "true", "yes")
    val_split= float(os.getenv("VAL_SPLIT", "0.2"))
    device   = torch.device(os.getenv("DEVICE", "cuda" if torch.cuda.is_available() else "cpu"))

    _seed_everything(seed)
    out_dir.mkdir(parents=True, exist_ok=True)

    print(f"Device: {device} | img_size={img_size} | epochs={epochs} | sweep={sweep}")

    df = pd.read_csv(csv_path)
    paths  = df["path"].tolist()
    labels = df["label"].tolist()

    train_paths, val_paths, train_labels, val_labels = train_test_split(
        paths, labels, test_size=val_split, random_state=seed, stratify=labels
    )
    print(f"Train: {len(train_paths)}  Val: {len(val_paths)}")

    base_cfg = DentalNetConfig.from_env()

    if sweep:
        results = _run_sweep(
            train_paths, train_labels, val_paths, val_labels,
            img_size, epochs, batch, device, out_dir, base_cfg,
        )
        best = max(results, key=lambda r: r["best_val_auc"])
        print(f"\nЛучшая конфигурация: {best['run']}  AUC={best['best_val_auc']:.4f}")
        _save_sweep_comparison(results, out_dir)
    else:
        results = [_train_one(
            train_paths, train_labels, val_paths, val_labels,
            base_cfg, img_size, epochs, batch, device,
            out_dir, run_name="dentalnet",
        )]
        best = results[0]

    summary = {
        "best_run": best["run"],
        "best_auc": best["best_val_auc"],
        "best_acc": best["final_acc"],
        "all_runs": [{"run": r["run"], "auc": r["best_val_auc"],
                      "acc": r["final_acc"]} for r in results],
    }
    summary_path = out_dir / "binary_summary.json"
    with open(summary_path, "w") as f:
        json.dump(summary, f, indent=2)

    # полные метрики
    metrics_path = out_dir / "binary_metrics.json"
    with open(metrics_path, "w") as f:
        json.dump(results, f, indent=2, default=str)

    print(f"\nГотово. Метрики → {metrics_path}")
    print(f"Лучшая модель → {out_dir / (best['run'] + '.pt')}")


if __name__ == "__main__":
    main()
