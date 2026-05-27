"""
SHAP + LIME объяснения для классификационной модели.

Запускается отдельно (без переобучения):
    docker compose -f docker-compose.yml -f docker-compose.gpu.yml run --rm opg-cnn-explain
или напрямую внутри контейнера:
    python src/explain.py
"""
from __future__ import annotations

import json
import os
from pathlib import Path

import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
import numpy as np
import shap
import torch
import torch.nn as nn
from lime import lime_image
from PIL import Image
from torchvision import datasets
from sklearn.model_selection import train_test_split

from checkpoint import auto_load_checkpoint
from dataset import build_transforms
from device_util import print_device_info, resolve_device
from inference import make_lime_predict_fn, predict_proba, tensor_to_uint8


def env_int(name: str, default: int) -> int:
    return int(os.getenv(name, str(default)))

def env_float(name: str, default: float) -> float:
    return float(os.getenv(name, str(default)))


# ── Сбор валидационных снимков ─────────────────────────────────────────────

def collect_val_samples(
    data_dir: Path,
    image_size: int,
    val_ratio: float,
    seed: int,
    max_samples: int,
) -> list[tuple[torch.Tensor, int, str]]:
    """По одному снимку на класс из val-сплита."""
    base = datasets.ImageFolder(root=str(data_dir))
    val_tf = build_transforms(image_size)[1]

    indices = list(range(len(base)))
    labels = [label for _, label in base.samples]
    _, val_idx = train_test_split(
        indices, test_size=val_ratio, random_state=seed, stratify=labels,
    )

    seen: set[int] = set()
    samples: list[tuple[torch.Tensor, int, str]] = []
    for idx in val_idx:
        path, label = base.samples[idx]
        if label not in seen:
            seen.add(label)
            pil = datasets.folder.default_loader(path)
            tensor = val_tf(pil)
            samples.append((tensor, label, path))
        if len(samples) >= max_samples:
            break
    return samples


def collect_background(
    data_dir: Path,
    image_size: int,
    seed: int,
    n: int,
    device: torch.device,
) -> torch.Tensor:
    """Случайный фоновый батч для SHAP GradientExplainer."""
    base = datasets.ImageFolder(root=str(data_dir))
    val_tf = build_transforms(image_size)[1]

    rng = np.random.RandomState(seed)
    idxs = rng.choice(len(base), size=min(n, len(base)), replace=False)
    tensors = []
    for i in idxs:
        path, _ = base.samples[i]
        pil = datasets.folder.default_loader(path)
        tensors.append(val_tf(pil))
    return torch.stack(tensors).to(device)


# ── SHAP ───────────────────────────────────────────────────────────────────

def save_shap(
    model: nn.Module,
    image_tensor: torch.Tensor,
    image_uint8: np.ndarray,
    background: torch.Tensor,
    pred_idx: int,
    class_name: str,
    true_name: str,
    out_path: Path,
    device: torch.device,
) -> None:
    model.eval()
    inp = image_tensor.unsqueeze(0).to(device)

    explainer = shap.GradientExplainer(model, background)
    shap_values = explainer.shap_values(inp)

    # Поддерживаем оба формата:
    #   SHAP < 0.46 — список [array(1,C,H,W), ...] длиной num_classes
    #   SHAP >= 0.46 — один массив (1, C, H, W, num_classes)
    if isinstance(shap_values, list):
        sv = shap_values[pred_idx][0]          # (C, H, W)
    elif isinstance(shap_values, np.ndarray):
        if shap_values.ndim == 5:              # (batch, C, H, W, num_classes)
            sv = shap_values[0, :, :, :, pred_idx]
        elif shap_values.ndim == 4:            # (batch, C, H, W) — single output
            sv = shap_values[0]
        else:
            sv = shap_values
    else:
        sv = np.array(shap_values)
    sv_mean = np.abs(sv).mean(axis=0)      # (H, W) — среднее по каналам
    sv_norm = sv_mean / (sv_mean.max() + 1e-8)

    title_color = "green" if true_name == class_name else "red"
    fig, axes = plt.subplots(1, 3, figsize=(15, 5))

    axes[0].imshow(image_uint8)
    axes[0].set_title(f"Исходное\ntrue: {true_name}", fontsize=10)
    axes[0].axis("off")

    im = axes[1].imshow(sv_norm, cmap="hot")
    axes[1].set_title(f"SHAP heatmap\npred: {class_name}", fontsize=10, color=title_color)
    axes[1].axis("off")
    fig.colorbar(im, ax=axes[1], fraction=0.046)

    overlay = image_uint8.astype(np.float32) / 255.0
    heatmap_rgb = plt.cm.hot(sv_norm)[..., :3]
    blended = np.clip(overlay * 0.55 + heatmap_rgb * 0.45, 0, 1)
    axes[2].imshow(blended)
    axes[2].set_title("Overlay", fontsize=10)
    axes[2].axis("off")

    fig.tight_layout()
    fig.savefig(out_path, dpi=130, bbox_inches="tight")
    plt.close(fig)


# ── LIME ───────────────────────────────────────────────────────────────────

def save_lime(
    image_uint8: np.ndarray,
    predict_fn,
    pred_idx: int,
    class_name: str,
    true_name: str,
    out_path: Path,
    num_samples: int,
    num_features: int,
) -> None:
    explainer = lime_image.LimeImageExplainer()
    explanation = explainer.explain_instance(
        image_uint8,
        predict_fn,
        top_labels=1,
        hide_color=0,
        num_samples=num_samples,
    )

    # Позитивные регионы (за предсказанный класс)
    _, mask_pos = explanation.get_image_and_mask(
        pred_idx, positive_only=True, num_features=num_features, hide_rest=False,
    )
    # Негативные регионы (против предсказанного класса)
    _, mask_neg = explanation.get_image_and_mask(
        pred_idx, positive_only=False, negative_only=True, num_features=num_features, hide_rest=False,
    )

    # Цветное наложение поверх оригинала
    overlay = image_uint8.astype(np.float32).copy()
    # Зелёный канал для позитивных регионов
    overlay[mask_pos == 1, 1] = np.clip(overlay[mask_pos == 1, 1] * 0.5 + 180, 0, 255)
    overlay[mask_pos == 1, 0] = overlay[mask_pos == 1, 0] * 0.5
    overlay[mask_pos == 1, 2] = overlay[mask_pos == 1, 2] * 0.5
    # Красный канал для негативных регионов
    overlay[mask_neg == 1, 0] = np.clip(overlay[mask_neg == 1, 0] * 0.5 + 180, 0, 255)
    overlay[mask_neg == 1, 1] = overlay[mask_neg == 1, 1] * 0.5
    overlay[mask_neg == 1, 2] = overlay[mask_neg == 1, 2] * 0.5
    overlay = np.clip(overlay, 0, 255).astype(np.uint8)

    title_color = "green" if true_name == class_name else "red"
    fig, axes = plt.subplots(1, 2, figsize=(13, 5))
    axes[0].imshow(image_uint8)
    axes[0].set_title(f"Исходное\ntrue: {true_name}", fontsize=10)
    axes[0].axis("off")
    axes[1].imshow(overlay)
    axes[1].set_title(
        f"LIME → {class_name}\n■ зелёный = за  ■ красный = против",
        fontsize=10, color=title_color,
    )
    axes[1].axis("off")
    fig.tight_layout()
    fig.savefig(out_path, dpi=130, bbox_inches="tight")
    plt.close(fig)


# ── Main ───────────────────────────────────────────────────────────────────

def main() -> None:
    data_dir = Path(os.getenv("DATA_DIR", "/data/dataset"))
    output_dir = Path(os.getenv("OUTPUT_DIR", "/data/output"))
    explain_dir = output_dir / "explain"

    # Автоопределение чекпойнта: абс. путь → rel. путь → фолбэки
    checkpoint_name = os.getenv("EXPLAIN_CHECKPOINT", "swa_model.pt")
    candidate = Path(checkpoint_name)
    if candidate.is_absolute() and candidate.is_file():
        checkpoint_path = candidate
    else:
        checkpoint_path = output_dir / checkpoint_name
        if not checkpoint_path.is_file():
            for fallback in ("best_mt_model.pt", "best_f1_model.pt", "best_model.pt"):
                fb = output_dir / fallback
                if fb.is_file():
                    checkpoint_path = fb
                    print(f"[explain] Фолбэк: {fallback}")
                    break

    image_size  = env_int("IMAGE_SIZE", 288)
    val_ratio   = env_float("VAL_RATIO", 0.2)
    seed        = env_int("SEED", 42)
    max_samples = env_int("EXPLAIN_SAMPLES", 6)
    lime_samples  = env_int("LIME_NUM_SAMPLES", 300)
    lime_features = env_int("LIME_NUM_FEATURES", 10)
    shap_background = env_int("SHAP_BACKGROUND", 16)

    device = resolve_device()
    print_device_info(device)
    print(f"Checkpoint : {checkpoint_path}")
    print(f"Explain dir: {explain_dir}")

    model, class_names, ckpt_image_size = auto_load_checkpoint(checkpoint_path, device)
    if ckpt_image_size != image_size:
        print(f"[explain] image_size из чекпойнта: {ckpt_image_size} (было {image_size})")
        image_size = ckpt_image_size

    val_transform = build_transforms(image_size)[1]
    predict_fn = make_lime_predict_fn(model, val_transform, device)

    samples = collect_val_samples(data_dir, image_size, val_ratio, seed, max_samples)
    if not samples:
        raise RuntimeError("Нет валидационных снимков")

    background = collect_background(data_dir, image_size, seed, shap_background, device)
    print(f"Снимков для объяснений: {len(samples)}  SHAP background: {background.shape[0]}")

    explain_dir.mkdir(parents=True, exist_ok=True)
    records: list[dict] = []

    for i, (tensor, true_label, path) in enumerate(samples):
        image_uint8 = tensor_to_uint8(tensor)
        probs = predict_proba(model, [image_uint8], val_transform, device)[0]
        pred_idx = int(np.argmax(probs))
        pred_name = class_names[pred_idx]
        true_name = class_names[true_label]

        prefix = explain_dir / f"sample_{i}"
        Image.fromarray(image_uint8).save(prefix.with_name(f"{prefix.name}_original.png"))

        print(f"[{i+1}/{len(samples)}] LIME   {Path(path).name}  true={true_name}  pred={pred_name}")
        save_lime(
            image_uint8, predict_fn, pred_idx, pred_name, true_name,
            prefix.with_name(f"{prefix.name}_lime.png"),
            num_samples=lime_samples, num_features=lime_features,
        )

        print(f"[{i+1}/{len(samples)}] SHAP   {Path(path).name}  pred={pred_name}")
        save_shap(
            model, tensor, image_uint8, background, pred_idx, pred_name, true_name,
            prefix.with_name(f"{prefix.name}_shap.png"),
            device,
        )

        records.append({
            "index": i,
            "image_path": path,
            "true_class": true_name,
            "predicted_class": pred_name,
            "correct": true_name == pred_name,
            "predicted_probability": round(float(probs[pred_idx]), 4),
            "class_probabilities": {class_names[j]: round(float(probs[j]), 4) for j in range(len(class_names))},
        })

    correct = sum(r["correct"] for r in records)
    (explain_dir / "summary.json").write_text(
        json.dumps({"samples": len(records), "correct": correct, "records": records},
                   ensure_ascii=False, indent=2),
        encoding="utf-8",
    )
    print(f"\nГотово: {explain_dir}  ({correct}/{len(records)} верных)")


if __name__ == "__main__":
    main()
