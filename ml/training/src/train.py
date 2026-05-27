from __future__ import annotations

import json
import os
import time
from pathlib import Path

import torch
import torch.nn as nn
from torch.optim import AdamW
from torch.optim.lr_scheduler import CosineAnnealingLR, LinearLR, ReduceLROnPlateau, SequentialLR
from torch.optim.swa_utils import AveragedModel, update_bn

from dataset import create_dataloaders, save_class_names
from device_util import print_device_info, resolve_device
from losses import build_criterion_from_env
from metrics_util import (
    evaluate_detailed,
    format_weights,
    majority_baseline_accuracy,
    prediction_distribution,
)
from model import create_model, optimizer_param_groups
from training_util import (
    cutmix_batch,
    mixup_batch,
    mixup_loss,
    set_encoder_bn_eval,
    set_encoder_trainable,
)


def env_int(name: str, default: int) -> int:
    return int(os.getenv(name, str(default)))


def env_float(name: str, default: float) -> float:
    return float(os.getenv(name, str(default)))


def env_bool(name: str, default: bool) -> bool:
    raw = os.getenv(name)
    if raw is None:
        return default
    return raw.strip().lower() in ("1", "true", "yes", "on")


def build_optimizer(model, learning_rate: float, backbone_lr_ratio: float, weight_decay: float, head_only: bool):
    if head_only and hasattr(model, "head"):
        return AdamW(model.head.parameters(), lr=learning_rate, weight_decay=weight_decay)
    return AdamW(
        optimizer_param_groups(model, learning_rate, backbone_lr_ratio),
        weight_decay=weight_decay,
    )


def build_phase1_scheduler(optimizer, warmup_epochs: int, total_phase1: int, base_lr: float):
    """Linear warmup → ReduceLROnPlateau (возвращаем и warmup-scheduler, и plateau-scheduler)."""
    if warmup_epochs > 0 and total_phase1 > warmup_epochs:
        warmup = LinearLR(
            optimizer,
            start_factor=0.1,
            end_factor=1.0,
            total_iters=warmup_epochs,
        )
        return warmup, ReduceLROnPlateau(optimizer, mode="min", factor=0.5, patience=5, min_lr=1e-6)
    return None, ReduceLROnPlateau(optimizer, mode="min", factor=0.5, patience=5, min_lr=1e-6)


def train_one_epoch(
    model,
    loader,
    criterion,
    optimizer,
    device,
    grad_clip: float,
    mixup_alpha: float,
    use_cutmix: bool,
    encoder_frozen: bool,
) -> tuple[float, float]:
    model.train()
    if encoder_frozen:
        set_encoder_bn_eval(model)

    running_loss = 0.0
    correct = 0
    total = 0

    for images, labels in loader:
        images = images.to(device)
        labels = labels.to(device)

        # Чередуем Mixup и CutMix если оба включены
        if use_cutmix and mixup_alpha > 0 and torch.rand(1).item() > 0.5:
            images, targets_a, targets_b, lam = cutmix_batch(images, labels, mixup_alpha)
        else:
            images, targets_a, targets_b, lam = mixup_batch(images, labels, mixup_alpha)

        optimizer.zero_grad()
        outputs = model(images)

        if lam is not None and targets_b is not None:
            loss = mixup_loss(criterion, outputs, targets_a, targets_b, lam)
            preds = outputs.argmax(dim=1)
            correct += (
                lam * (preds == targets_a).sum().item()
                + (1.0 - lam) * (preds == targets_b).sum().item()
            )
        else:
            loss = criterion(outputs, labels)
            correct += (outputs.argmax(1) == labels).sum().item()

        loss.backward()
        if grad_clip > 0:
            torch.nn.utils.clip_grad_norm_(model.parameters(), grad_clip)
        optimizer.step()

        running_loss += loss.item() * images.size(0)
        total += labels.size(0)

    return running_loss / total, correct / total


def print_class_balance(class_names: list[str], train_counts: torch.Tensor, val_counts: torch.Tensor) -> None:
    print("Распределение классов (train / val):")
    for i, name in enumerate(class_names):
        print(f"  {name}: {int(train_counts[i])} / {int(val_counts[i])}")
    val_baseline = majority_baseline_accuracy(val_counts)
    print(f"Baseline val accuracy (всегда самый частый класс): {val_baseline:.4f}")
    print("Смотрите macro_f1 и val loss — accuracy на дисбалансе обманчива.")


def main() -> None:
    data_dir = Path(os.getenv("DATA_DIR", "/data/dataset"))
    output_dir = Path(os.getenv("OUTPUT_DIR", "/data/output"))

    epochs = env_int("EPOCHS", 120)
    batch_size = env_int("BATCH_SIZE", 16)
    image_size = env_int("IMAGE_SIZE", 224)
    learning_rate = env_float("LEARNING_RATE", 3e-4)
    backbone_lr_ratio = env_float("BACKBONE_LR_RATIO", 0.1)
    weight_decay = env_float("WEIGHT_DECAY", 1e-3)
    model_backbone = os.getenv("MODEL_BACKBONE", "efficientnet_b0")
    val_ratio = env_float("VAL_RATIO", 0.2)
    num_workers = env_int("NUM_WORKERS", 2)
    seed = env_int("SEED", 42)
    use_class_weights = env_bool("USE_CLASS_WEIGHTS", True)
    grad_clip = env_float("GRAD_CLIP_NORM", 1.0)
    mixup_alpha = env_float("MIXUP_ALPHA", 0.3)
    use_cutmix = env_bool("USE_CUTMIX", True)
    freeze_encoder_epochs = env_int("FREEZE_ENCODER_EPOCHS", 20)
    warmup_epochs = env_int("WARMUP_EPOCHS", 5)
    early_stop_patience = env_int("EARLY_STOP_PATIENCE", 20)
    use_tta = env_bool("USE_TTA", True)
    use_swa = env_bool("USE_SWA", True)
    swa_start_epoch = env_int("SWA_START_EPOCH", 0)  # 0 = авто (60% от epochs)
    swa_lr = env_float("SWA_LR", 1e-4)

    torch.manual_seed(seed)
    if torch.cuda.is_available():
        torch.cuda.manual_seed_all(seed)
    torch.backends.cudnn.deterministic = True
    torch.backends.cudnn.benchmark = False

    device = resolve_device()
    print_device_info(device)
    print(f"Dataset: {data_dir}  Output: {output_dir}")

    bundle = create_dataloaders(
        data_dir=data_dir,
        image_size=image_size,
        batch_size=batch_size,
        val_ratio=val_ratio,
        num_workers=num_workers,
        seed=seed,
    )
    class_names = bundle.class_names
    print(f"Classes ({len(class_names)}): {class_names}")
    print(bundle.augment.summary())
    print_class_balance(class_names, bundle.train_counts, bundle.val_counts)
    print(f"Class weights: {format_weights(class_names, bundle.class_weights)}")

    model = create_model(len(class_names), backbone=model_backbone).to(device)
    backbone_name = getattr(model, "model_backbone", model_backbone)
    print(f"Model: {backbone_name}")
    print(f"Mixup alpha={mixup_alpha}  CutMix={use_cutmix}  TTA={use_tta}  SWA={use_swa}")
    print(f"freeze encoder {freeze_encoder_epochs} эпох  warmup {warmup_epochs} эпох")

    class_weights = bundle.class_weights if use_class_weights else None
    criterion = build_criterion_from_env(class_weights, device)
    print(f"Loss: {criterion.description}")  # type: ignore[attr-defined]

    set_encoder_trainable(model, trainable=False)
    optimizer = build_optimizer(model, learning_rate, backbone_lr_ratio, weight_decay, head_only=True)
    warmup_sched, plateau_sched = build_phase1_scheduler(optimizer, warmup_epochs, freeze_encoder_epochs, learning_rate)
    print(f"Phase 1: только голова, LR={learning_rate:.2e}  warmup={warmup_epochs} эпох")

    output_dir.mkdir(parents=True, exist_ok=True)
    save_class_names(output_dir, class_names)

    # SWA setup
    if swa_start_epoch == 0:
        swa_start_epoch = max(freeze_encoder_epochs + 1, int(epochs * 0.6))
    swa_model: AveragedModel | None = None
    if use_swa:
        swa_model = AveragedModel(model)
        print(f"SWA: старт с эпохи {swa_start_epoch}, lr={swa_lr:.2e}")

    best_val_loss = float("inf")
    best_loss_epoch = 0
    best_macro_f1 = 0.0
    best_f1_epoch = 0
    best_f1_val_loss = float("inf")
    epochs_without_improvement = 0
    min_f1_delta = env_float("EARLY_STOP_MIN_DELTA", 0.005)
    history: list[dict] = []
    started = time.time()
    phase2_scheduler: CosineAnnealingLR | None = None

    for epoch in range(1, epochs + 1):
        encoder_frozen = epoch <= freeze_encoder_epochs

        # Переход в фазу 2: размораживаем encoder
        if epoch == freeze_encoder_epochs + 1 and hasattr(model, "encoder"):
            set_encoder_trainable(model, trainable=True)
            finetune_lr = learning_rate * env_float("FINETUNE_LR_FACTOR", 0.3)
            optimizer = build_optimizer(model, finetune_lr, backbone_lr_ratio, weight_decay, head_only=False)
            t_max = max(1, epochs - freeze_encoder_epochs)
            phase2_scheduler = CosineAnnealingLR(optimizer, T_max=t_max, eta_min=1e-6)
            print(f"  Phase 2: fine-tune всего {backbone_name}, head LR={finetune_lr:.2e}, "
                  f"encoder LR={finetune_lr * backbone_lr_ratio:.2e}  T_max={t_max}")

        # Обучение — Mixup/CutMix только в фазе 2
        effective_mixup = mixup_alpha if not encoder_frozen else 0.0
        effective_cutmix = use_cutmix and not encoder_frozen

        train_loss, train_acc = train_one_epoch(
            model, bundle.train_loader, criterion, optimizer, device,
            grad_clip, effective_mixup, effective_cutmix, encoder_frozen,
        )

        val_tta = use_tta and not encoder_frozen
        val_metrics = evaluate_detailed(
            model, bundle.val_loader, criterion, device, class_names, use_tta=val_tta,
        )
        val_loss = val_metrics["loss"]
        val_acc = val_metrics["acc"]
        val_f1 = val_metrics["macro_f1"]

        # Шедулеры
        if phase2_scheduler is not None:
            phase2_scheduler.step()
        elif encoder_frozen:
            if warmup_sched is not None and epoch <= warmup_epochs:
                warmup_sched.step()
            else:
                plateau_sched.step(val_loss)

        # SWA: обновляем усреднённую модель
        if use_swa and swa_model is not None and epoch >= swa_start_epoch:
            swa_model.update_parameters(model)

        pred_dist = prediction_distribution(val_metrics["y_pred"], class_names)
        current_lr = max(pg["lr"] for pg in optimizer.param_groups)
        phase = "head" if encoder_frozen else "full"
        tta_marker = "+TTA" if val_tta else ""

        row = {
            "epoch": epoch,
            "phase": phase + tta_marker,
            "train_loss": round(train_loss, 4),
            "train_acc": round(train_acc, 4),
            "val_loss": round(val_loss, 4),
            "val_acc": round(val_acc, 4),
            "val_macro_f1": round(val_f1, 4),
            "val_weighted_f1": round(val_metrics["weighted_f1"], 4),
            "lr": round(current_lr, 6),
            "val_pred_distribution": pred_dist,
        }
        history.append(row)

        val_loss_w = val_metrics.get("loss_weighted", val_loss)
        print(
            f"Epoch {epoch}/{epochs} [{phase}{tta_marker}] | "
            f"train loss={train_loss:.4f} acc={train_acc:.4f} | "
            f"val loss={val_loss:.4f} (w={val_loss_w:.4f}) acc={val_acc:.4f} macro_f1={val_f1:.4f} | "
            f"lr={current_lr:.2e}"
        )

        if epoch == 1 or epoch % 10 == 0 or val_loss < best_val_loss or val_f1 > best_macro_f1:
            print(f"  val predictions: {pred_dist}")

        loss_improved = val_loss < best_val_loss - 1e-4
        f1_improved = val_f1 > best_macro_f1 + min_f1_delta

        def _save(path: Path, report_path: Path) -> None:
            torch.save(
                {
                    "model_state_dict": model.state_dict(),
                    "model_backbone": backbone_name,
                    "num_classes": len(class_names),
                    "class_names": class_names,
                    "image_size": image_size,
                    "val_acc": val_acc,
                    "val_loss": val_loss,
                    "val_macro_f1": val_f1,
                    "epoch": epoch,
                },
                path,
            )
            report_path.write_text(val_metrics["classification_report"], encoding="utf-8")

        if loss_improved:
            best_val_loss = val_loss
            best_loss_epoch = epoch
            _save(output_dir / "best_model.pt", output_dir / "classification_report.txt")
            print(f"  → best_model.pt (val_loss={val_loss:.4f}, macro_f1={val_f1:.4f})")

        if f1_improved:
            best_macro_f1 = val_f1
            best_f1_epoch = epoch
            best_f1_val_loss = val_loss
            _save(output_dir / "best_f1_model.pt", output_dir / "classification_report_f1.txt")
            print(f"  → best_f1_model.pt (macro_f1={val_f1:.4f}, val_loss={val_loss:.4f})")

        if not loss_improved and not f1_improved:
            epochs_without_improvement += 1
        else:
            epochs_without_improvement = 0

        if epoch > freeze_encoder_epochs and epochs_without_improvement >= early_stop_patience:
            print(f"Early stopping: нет улучшения ни val_loss ни macro_f1 {early_stop_patience} эпох.")
            break

    # ── SWA: финализация ─────────────────────────────────────────────────────
    if use_swa and swa_model is not None:
        print("\nSWA: обновление BatchNorm статистик...")
        update_bn(bundle.train_loader, swa_model, device=device)
        swa_metrics = evaluate_detailed(
            swa_model, bundle.val_loader, criterion, device, class_names, use_tta=use_tta,
        )
        swa_f1 = swa_metrics["macro_f1"]
        swa_loss = swa_metrics["loss"]
        print(f"SWA model: macro_f1={swa_f1:.4f}  val_loss={swa_loss:.4f}")
        print(f"  val predictions: {prediction_distribution(swa_metrics['y_pred'], class_names)}")
        torch.save(
            {
                "model_state_dict": swa_model.module.state_dict(),
                "model_backbone": backbone_name,
                "num_classes": len(class_names),
                "class_names": class_names,
                "image_size": image_size,
                "val_macro_f1": swa_f1,
                "val_loss": swa_loss,
                "swa": True,
            },
            output_dir / "swa_model.pt",
        )
        (output_dir / "classification_report_swa.txt").write_text(
            swa_metrics["classification_report"], encoding="utf-8"
        )
        # Обновляем best_f1 если SWA лучше
        if swa_f1 > best_macro_f1:
            print(f"  SWA лучше best_f1_model! ({swa_f1:.4f} > {best_macro_f1:.4f})")
            best_macro_f1 = swa_f1
            best_f1_epoch = -1  # SWA

    elapsed = round(time.time() - started, 2)
    summary = {
        "epochs_run": len(history),
        "best_val_loss": round(best_val_loss, 4),
        "best_loss_epoch": best_loss_epoch,
        "best_macro_f1": round(best_macro_f1, 4),
        "best_f1_epoch": best_f1_epoch,
        "best_f1_val_loss": round(best_f1_val_loss, 4) if best_f1_val_loss < float("inf") else None,
        "val_majority_baseline": round(majority_baseline_accuracy(bundle.val_counts), 4),
        "elapsed_seconds": elapsed,
        "device": str(device),
        "num_classes": len(class_names),
        "augmentation": bundle.augment.summary(),
        "use_class_weights": use_class_weights,
        "mixup_alpha": mixup_alpha,
        "use_cutmix": use_cutmix,
        "use_tta": use_tta,
        "use_swa": use_swa,
        "freeze_encoder_epochs": freeze_encoder_epochs,
        "model_backbone": backbone_name,
        "loss": getattr(criterion, "description", "unknown"),
        "history": history,
    }
    (output_dir / "metrics.json").write_text(
        json.dumps(summary, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )
    print(f"\nDone in {elapsed}s.")
    print(f"  best_model.pt     — val_loss={best_val_loss:.4f} (эпоха {best_loss_epoch})")
    print(f"  best_f1_model.pt  — macro_f1={best_macro_f1:.4f} (эпоха {best_f1_epoch})")
    if use_swa:
        print("  swa_model.pt      — usреднённые веса (рекомендуется для инференса)")
    print("Для MIS/инференса: EXPLAIN_CHECKPOINT=swa_model.pt (или best_f1_model.pt)")

    if env_bool("RUN_EXPLAIN", True):
        print("\nRunning GradCAM & LIME explanations...")
        from explain import main as run_explain
        run_explain()


if __name__ == "__main__":
    mode = os.getenv("TRAINING_MODE", "supervised").strip().lower()
    if mode == "mean_teacher":
        from mean_teacher import main as mt_main
        mt_main()
    else:
        main()
