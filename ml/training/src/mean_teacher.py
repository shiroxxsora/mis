"""
Mean Teacher — Semi-Supervised Learning для классификации OPG.

Источник идеи: Tarvainen & Valpola, "Mean teachers are better role models" (2017).
Адаптация: Docker-окружение, env-конфиг, plt.savefig вместо plt.show.

TRAINING_MODE=mean_teacher запускает этот модуль вместо обычного train.py.
"""
from __future__ import annotations

import copy
import json
import os
import random
import warnings
from collections import Counter
from itertools import cycle
from pathlib import Path

import matplotlib
matplotlib.use("Agg")  # безголовый backend, без X11
import matplotlib.pyplot as plt
import numpy as np
import pandas as pd
import seaborn as sns
import timm
import torch
import torch.nn as nn
import torch.nn.functional as F
from PIL import Image
from sklearn.metrics import (
    accuracy_score,
    classification_report,
    confusion_matrix,
    f1_score,
)
from sklearn.model_selection import train_test_split
from sklearn.utils import resample
from torch.utils.data import DataLoader, Dataset
from torchvision import transforms
from torchvision.datasets import ImageFolder

warnings.filterwarnings("ignore")


# ── Helpers ────────────────────────────────────────────────────────────────

def _env(name: str, default: str) -> str:
    return os.getenv(name, default)

def _env_int(name: str, default: int) -> int:
    return int(os.getenv(name, str(default)))

def _env_float(name: str, default: float) -> float:
    return float(os.getenv(name, str(default)))

def _env_list_float(name: str, default: list[float]) -> list[float]:
    raw = os.getenv(name)
    if raw is None:
        return default
    return [float(x.strip()) for x in raw.split(",") if x.strip()]

def _env_list_int(name: str, default: list[int]) -> list[int]:
    raw = os.getenv(name)
    if raw is None:
        return default
    return [int(x.strip()) for x in raw.split(",") if x.strip()]


def set_seed(seed: int) -> None:
    torch.manual_seed(seed)
    torch.cuda.manual_seed_all(seed)
    np.random.seed(seed)
    random.seed(seed)
    torch.backends.cudnn.deterministic = True
    torch.backends.cudnn.benchmark = False


# ── Transforms ─────────────────────────────────────────────────────────────

def get_transforms(image_size: int = 224):
    mean = [0.485, 0.456, 0.406]
    std = [0.229, 0.224, 0.225]

    transform_weak = transforms.Compose([
        transforms.Grayscale(num_output_channels=3),
        transforms.Resize((image_size, image_size)),
        transforms.RandomHorizontalFlip(p=0.5),
        transforms.ToTensor(),
        transforms.Normalize(mean, std),
    ])

    transform_strong = transforms.Compose([
        transforms.Grayscale(num_output_channels=3),
        transforms.Resize((image_size, image_size)),
        transforms.RandomHorizontalFlip(p=0.5),
        transforms.RandomRotation(degrees=15),
        transforms.RandomApply([
            transforms.ColorJitter(brightness=0.3, contrast=0.3),
        ], p=0.7),
        transforms.RandomApply([transforms.GaussianBlur(kernel_size=3)], p=0.4),
        transforms.RandomApply([transforms.RandomAffine(degrees=0, translate=(0.08, 0.08))], p=0.3),
        transforms.RandomAutocontrast(p=0.3),
        transforms.RandomEqualize(p=0.2),
        transforms.ToTensor(),
        transforms.Normalize(mean, std),
    ])

    transform_val = transforms.Compose([
        transforms.Grayscale(num_output_channels=3),
        transforms.Resize((image_size, image_size)),
        transforms.ToTensor(),
        transforms.Normalize(mean, std),
    ])

    return transform_weak, transform_strong, transform_val


# ── Dataset ────────────────────────────────────────────────────────────────

class MeanTeacherDataset(Dataset):
    def __init__(
        self,
        paths: list[str],
        labels: list[int] | None,
        weak_transform,
        strong_transform,
        return_labels: bool = True,
    ):
        self.paths = paths
        self.labels = labels if labels is not None else [0] * len(paths)
        self.weak = weak_transform
        self.strong = strong_transform
        self.return_labels = return_labels

    def __len__(self) -> int:
        return len(self.paths)

    def __getitem__(self, idx: int):
        try:
            img = Image.open(self.paths[idx]).convert("RGB")
        except Exception:
            img = Image.new("RGB", (224, 224), color="white")

        if self.return_labels:
            return self.weak(img), self.strong(img), self.labels[idx]
        return self.weak(img), self.strong(img)


# ── Oversampling ───────────────────────────────────────────────────────────

def oversample_classes(
    all_paths: list[str],
    all_labels: list[int],
) -> tuple[list[str], list[int]]:
    class_counts = Counter(all_labels)
    max_count = max(class_counts.values())
    print(f"  Исходное распределение: {dict(sorted(class_counts.items()))}")

    out_paths, out_labels = [], []
    for cls, cnt in class_counts.items():
        idxs = [i for i, l in enumerate(all_labels) if l == cls]
        p = [all_paths[i] for i in idxs]
        l_ = [all_labels[i] for i in idxs]
        rp, rl = resample(p, l_, n_samples=max_count, replace=True, random_state=42)
        out_paths.extend(rp)
        out_labels.extend(rl)

    print(f"  После oversample: {dict(sorted(Counter(out_labels).items()))}")
    return out_paths, out_labels


# ── Model ──────────────────────────────────────────────────────────────────

def create_model(num_classes: int, model_name: str = "efficientnet_b2") -> nn.Module:
    model = timm.create_model(model_name, pretrained=True)
    # timm EfficientNet: model.classifier — Linear
    in_features = model.classifier.in_features
    model.classifier = nn.Linear(in_features, num_classes)
    return model


# ── EMA update ─────────────────────────────────────────────────────────────

@torch.no_grad()
def update_ema(ema_model: nn.Module, model: nn.Module, alpha: float = 0.999) -> None:
    for ema_p, p in zip(ema_model.parameters(), model.parameters()):
        ema_p.data.mul_(alpha).add_(p.data, alpha=1.0 - alpha)


# ── Data preparation ───────────────────────────────────────────────────────

def prepare_loaders(
    all_paths: list[str],
    all_labels: list[int],
    image_size: int,
    batch_size: int,
    frac: float,
    seed: int,
    val_size: float = 0.15,
    num_workers: int = 2,
):
    paths_os, labels_os = oversample_classes(all_paths, all_labels)

    tf_weak, tf_strong, tf_val = get_transforms(image_size)

    train_p, temp_p, train_l, temp_l = train_test_split(
        paths_os, labels_os, test_size=1.0 - frac, stratify=labels_os, random_state=seed,
    )
    val_p, test_p, val_l, test_l = train_test_split(
        temp_p, temp_l, test_size=val_size, stratify=temp_l, random_state=seed,
    )

    print(f"  Train={len(train_p)}  Val={len(val_p)}  Test={len(test_p)}  Unlabeled={len(paths_os)}")

    pin = torch.cuda.is_available()
    train_ds = MeanTeacherDataset(train_p, train_l, tf_weak, tf_strong)
    unlab_ds = MeanTeacherDataset(paths_os, None, tf_weak, tf_strong, return_labels=False)
    val_ds = MeanTeacherDataset(val_p, val_l, tf_val, tf_val)
    test_ds = MeanTeacherDataset(test_p, test_l, tf_val, tf_val)

    lab_loader = DataLoader(train_ds, batch_size=batch_size, shuffle=True, num_workers=num_workers, pin_memory=pin)
    unlab_loader = DataLoader(unlab_ds, batch_size=batch_size, shuffle=True, num_workers=num_workers, pin_memory=pin)
    val_loader = DataLoader(val_ds, batch_size=batch_size, shuffle=False, num_workers=num_workers, pin_memory=pin)
    test_loader = DataLoader(test_ds, batch_size=batch_size, shuffle=False, num_workers=num_workers, pin_memory=pin)

    return lab_loader, unlab_loader, val_loader, test_loader


# ── Training loop ──────────────────────────────────────────────────────────

def run_experiment(
    device: torch.device,
    all_paths: list[str],
    all_labels: list[int],
    class_names: list[str],
    output_dir: Path,
    frac: float,
    seed: int,
    # hyperparams
    model_name: str,
    image_size: int,
    batch_size: int,
    epochs: int,
    lr: float,
    lambda_u: float,
    ema_alpha: float,
    num_workers: int,
) -> dict:
    set_seed(seed)
    tag = f"frac{int(frac*100)}_seed{seed}"
    print(f"\n{'='*60}\nEксперимент: {frac*100:.0f}% labeled, seed={seed}\n{'='*60}")

    lab_loader, unlab_loader, val_loader, test_loader = prepare_loaders(
        all_paths, all_labels, image_size, batch_size, frac, seed, num_workers=num_workers,
    )
    unlab_iter = cycle(unlab_loader)

    num_classes = len(class_names)
    student = create_model(num_classes, model_name).to(device)
    teacher = create_model(num_classes, model_name).to(device)
    teacher.load_state_dict(student.state_dict())
    teacher.eval()

    optimizer = torch.optim.AdamW(student.parameters(), lr=lr, weight_decay=1e-4)
    scheduler = torch.optim.lr_scheduler.CosineAnnealingLR(optimizer, T_max=epochs)
    criterion = nn.CrossEntropyLoss()

    train_losses, val_losses, val_accs, val_f1s = [], [], [], []
    best_val_acc = 0.0
    best_state: dict | None = None

    for epoch in range(1, epochs + 1):
        student.train()
        teacher.eval()
        run_loss = run_sup = run_unsup = 0.0

        for x_l_w, x_l_s, y_l in lab_loader:
            try:
                x_ul_w, x_ul_s = next(unlab_iter)
            except StopIteration:
                unlab_iter = cycle(unlab_loader)
                x_ul_w, x_ul_s = next(unlab_iter)

            x_l_w = x_l_w.to(device); x_l_s = x_l_s.to(device); y_l = y_l.to(device)
            x_ul_w = x_ul_w.to(device); x_ul_s = x_ul_s.to(device)

            optimizer.zero_grad()

            # Supervised loss — слабая аугментация labeled
            Lx = criterion(student(x_l_w), y_l)

            # Consistency loss — teacher(weak) vs student(strong) на unlabeled
            with torch.no_grad():
                probs_teacher = F.softmax(teacher(x_ul_w), dim=1)
            probs_student = F.softmax(student(x_ul_s), dim=1)
            Lu = F.mse_loss(probs_student, probs_teacher)

            loss = Lx + lambda_u * Lu
            loss.backward()
            torch.nn.utils.clip_grad_norm_(student.parameters(), 1.0)
            optimizer.step()

            update_ema(teacher, student, ema_alpha)

            run_loss += loss.item()
            run_sup += Lx.item()
            run_unsup += Lu.item()

        scheduler.step()

        # Val
        student.eval()
        val_loss_acc = 0.0
        y_true_v: list[int] = []
        y_pred_v: list[int] = []
        with torch.no_grad():
            for x_v, _, y_v in val_loader:
                x_v, y_v = x_v.to(device), y_v.to(device)
                out = student(x_v)
                val_loss_acc += criterion(out, y_v).item()
                y_pred_v.extend(out.argmax(1).cpu().tolist())
                y_true_v.extend(y_v.cpu().tolist())

        n = len(lab_loader)
        avg_train = run_loss / n
        avg_val = val_loss_acc / len(val_loader)
        acc = accuracy_score(y_true_v, y_pred_v)
        f1 = f1_score(y_true_v, y_pred_v, average="macro", zero_division=0)

        train_losses.append(avg_train)
        val_losses.append(avg_val)
        val_accs.append(acc)
        val_f1s.append(f1)

        if acc > best_val_acc:
            best_val_acc = acc
            best_state = copy.deepcopy(student.state_dict())

        if True:  # каждую эпоху
            print(
                f"  Epoch [{epoch:3d}/{epochs}] "
                f"loss={avg_train:.4f} (sup={run_sup/n:.4f} unsup={run_unsup/n:.4f}) | "
                f"val_loss={avg_val:.4f} acc={acc:.4f} macro_f1={f1:.4f}"
            )

    # Test
    student.load_state_dict(best_state)  # type: ignore[arg-type]
    student.eval()
    y_true_t: list[int] = []
    y_pred_t: list[int] = []
    with torch.no_grad():
        for x_t, _, y_t in test_loader:
            x_t, y_t = x_t.to(device), y_t.to(device)
            y_pred_t.extend(student(x_t).argmax(1).cpu().tolist())
            y_true_t.extend(y_t.cpu().tolist())

    test_acc = accuracy_score(y_true_t, y_pred_t)
    test_f1 = f1_score(y_true_t, y_pred_t, average="macro", zero_division=0)
    cls_report = classification_report(y_true_t, y_pred_t, target_names=class_names, zero_division=0)

    print(f"  → Test acc={test_acc:.4f}  macro_f1={test_f1:.4f}")
    print(cls_report)

    # Сохраняем веса
    exp_dir = output_dir / "mean_teacher" / tag
    exp_dir.mkdir(parents=True, exist_ok=True)
    torch.save(
        {
            "model_state_dict": best_state,
            "model_name": model_name,
            "num_classes": num_classes,
            "class_names": class_names,
            "image_size": image_size,
            "val_acc": best_val_acc,
            "test_acc": test_acc,
            "test_macro_f1": test_f1,
            "frac": frac,
            "seed": seed,
        },
        exp_dir / "best_model.pt",
    )
    (exp_dir / "classification_report.txt").write_text(cls_report, encoding="utf-8")

    # Кривые обучения
    _plot_curves(train_losses, val_losses, val_accs, val_f1s, frac, seed, exp_dir)
    _plot_confusion(y_true_t, y_pred_t, class_names, frac, seed, exp_dir)

    return {
        "frac": frac,
        "seed": seed,
        "best_val_acc": round(best_val_acc, 4),
        "best_val_f1": round(float(np.max(val_f1s)), 4),
        "test_acc": round(test_acc, 4),
        "test_f1": round(test_f1, 4),
    }


# ── Plots ──────────────────────────────────────────────────────────────────

def _plot_curves(
    train_losses: list,
    val_losses: list,
    val_accs: list,
    val_f1s: list,
    frac: float,
    seed: int,
    out_dir: Path,
) -> None:
    fig, axes = plt.subplots(1, 2, figsize=(14, 5))
    axes[0].plot(train_losses, label="Train Loss")
    axes[0].plot(val_losses, label="Val Loss")
    axes[0].set_title(f"Loss curves (frac={frac*100:.0f}%, seed={seed})")
    axes[0].set_xlabel("Epoch"); axes[0].legend(); axes[0].grid(alpha=0.3)

    axes[1].plot(val_accs, label="Val Accuracy")
    axes[1].plot(val_f1s, label="Val macro F1")
    axes[1].set_title(f"Metrics (frac={frac*100:.0f}%, seed={seed})")
    axes[1].set_xlabel("Epoch"); axes[1].legend(); axes[1].grid(alpha=0.3)

    plt.tight_layout()
    plt.savefig(out_dir / "curves.png", dpi=100)
    plt.close(fig)


def _plot_confusion(
    y_true: list,
    y_pred: list,
    class_names: list[str],
    frac: float,
    seed: int,
    out_dir: Path,
) -> None:
    cm = confusion_matrix(y_true, y_pred)
    fig, ax = plt.subplots(figsize=(8, 6))
    sns.heatmap(cm, annot=True, fmt="d", cmap="Blues",
                xticklabels=class_names, yticklabels=class_names, ax=ax)
    ax.set_title(f"Confusion matrix (frac={frac*100:.0f}%, seed={seed})")
    ax.set_xlabel("Predicted"); ax.set_ylabel("True")
    plt.tight_layout()
    plt.savefig(out_dir / "confusion_matrix.png", dpi=100)
    plt.close(fig)


def _plot_summary(results: list[dict], output_dir: Path) -> None:
    if not results:
        return
    df = pd.DataFrame(results)
    fig, axes = plt.subplots(1, 2, figsize=(12, 5))
    for frac, grp in df.groupby("frac"):
        axes[0].scatter([frac] * len(grp), grp["test_acc"], alpha=0.7, s=60)
        axes[1].scatter([frac] * len(grp), grp["test_f1"], alpha=0.7, s=60)

    for ax, metric in zip(axes, ["test_acc", "test_f1"]):
        means = df.groupby("frac")[metric].mean()
        ax.plot(means.index, means.values, "k--o", label="mean")
        ax.set_xlabel("Labeled fraction")
        ax.set_ylabel(metric.replace("_", " ").title())
        ax.set_title(f"Mean Teacher — {metric}")
        ax.legend(); ax.grid(alpha=0.3)

    plt.tight_layout()
    plt.savefig(output_dir / "mean_teacher" / "summary.png", dpi=100)
    plt.close(fig)


# ── Entry point ────────────────────────────────────────────────────────────

def main() -> None:
    data_dir = Path(_env("DATA_DIR", "/data/dataset"))
    output_dir = Path(_env("OUTPUT_DIR", "/data/output"))

    model_name = _env("MT_MODEL_NAME", "efficientnet_b2")
    image_size = _env_int("IMAGE_SIZE", 224)
    batch_size = _env_int("MT_BATCH_SIZE", 32)
    epochs = _env_int("MT_EPOCHS", 20)
    lr = _env_float("MT_LR", 3e-5)
    lambda_u = _env_float("MT_LAMBDA_U", 1.0)
    ema_alpha = _env_float("MT_EMA_ALPHA", 0.999)
    fractions = _env_list_float("MT_FRACTIONS", [0.2, 0.3, 0.5])
    seeds = _env_list_int("MT_SEEDS", [42, 1337, 2025])
    num_workers = _env_int("NUM_WORKERS", 2)

    device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
    print(f"Mean Teacher — device={device}  model={model_name}  image_size={image_size}")
    print(f"fractions={fractions}  seeds={seeds}  epochs={epochs}  lr={lr}")

    base_ds = ImageFolder(root=str(data_dir))
    all_paths = [p for p, _ in base_ds.samples]
    all_labels = [l for _, l in base_ds.samples]
    class_names = base_ds.classes
    print(f"Dataset: {len(all_paths)} images, {len(class_names)} classes: {class_names}")

    results: list[dict] = []
    for frac in fractions:
        for seed in seeds:
            try:
                res = run_experiment(
                    device=device,
                    all_paths=all_paths,
                    all_labels=all_labels,
                    class_names=class_names,
                    output_dir=output_dir,
                    frac=frac,
                    seed=seed,
                    model_name=model_name,
                    image_size=image_size,
                    batch_size=batch_size,
                    epochs=epochs,
                    lr=lr,
                    lambda_u=lambda_u,
                    ema_alpha=ema_alpha,
                    num_workers=num_workers,
                )
                results.append(res)
            except Exception as e:
                print(f"  Ошибка (frac={frac}, seed={seed}): {e}")
            finally:
                torch.cuda.empty_cache()

    if not results:
        print("Ни одного успешного эксперимента.")
        return

    # Сводка
    df = pd.DataFrame(results)
    print(f"\n{'='*60}\nITOGI\n{'='*60}")
    print(df.to_string(index=False))

    agg_rows = []
    for frac, grp in df.groupby("frac"):
        row = {
            "frac": frac,
            "test_acc_mean": round(grp["test_acc"].mean(), 4),
            "test_acc_std": round(grp["test_acc"].std(), 4),
            "test_f1_mean": round(grp["test_f1"].mean(), 4),
            "test_f1_std": round(grp["test_f1"].std(), 4),
        }
        agg_rows.append(row)
        print(f"\nFraction {frac*100:.0f}%:")
        print(f"  Test Acc:   {row['test_acc_mean']:.4f} ± {row['test_acc_std']:.4f}")
        print(f"  Test F1:    {row['test_f1_mean']:.4f} ± {row['test_f1_std']:.4f}")

    summary = {
        "results": results,
        "aggregated": agg_rows,
        "model_name": model_name,
        "epochs": epochs,
        "fractions": fractions,
        "seeds": seeds,
    }
    mt_dir = output_dir / "mean_teacher"
    mt_dir.mkdir(parents=True, exist_ok=True)
    (mt_dir / "results.json").write_text(
        json.dumps(summary, ensure_ascii=False, indent=2), encoding="utf-8"
    )
    _plot_summary(results, output_dir)
    print(f"\nРезультаты → {mt_dir}/results.json")

    # Лучшая модель по test_f1
    best = max(results, key=lambda r: r["test_f1"])
    print(
        f"\nЛучший эксперимент: frac={best['frac']*100:.0f}%  seed={best['seed']}  "
        f"test_f1={best['test_f1']:.4f}  test_acc={best['test_acc']:.4f}"
    )
    best_src = (
        output_dir / "mean_teacher"
        / f"frac{int(best['frac']*100)}_seed{best['seed']}"
        / "best_model.pt"
    )
    best_dst = output_dir / "best_mt_model.pt"
    if best_src.is_file():
        import shutil
        shutil.copy2(best_src, best_dst)
        print(f"Скопировано в {best_dst}")

    # ── Explain (GradCAM + LIME) на лучшей MT-модели ──────────────────────
    run_explain = os.getenv("RUN_EXPLAIN", "true").strip().lower() in ("1", "true", "yes", "on")
    if run_explain and best_dst.is_file():
        print("\nRunning GradCAM & LIME explanations (best MT model)...")
        os.environ["EXPLAIN_CHECKPOINT"] = str(best_dst)
        try:
            from explain import main as run_explain_fn
            run_explain_fn()
        except Exception as e:
            print(f"[explain] Ошибка: {e}")


if __name__ == "__main__":
    main()
