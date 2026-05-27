"""
SHAP + LIME для бинарного DentalNet (Healthy / Unhealthy).

Запуск после обучения:
    docker compose --env-file .env run --rm dental-binary python explain.py

Env vars (те же, что в .env + дополнительные):
  CHECKPOINT      — имя файла модели в OUTPUT_DIR (default: dentalnet.pt)
  OUTPUT_DIR      — куда писать объяснения (default: /data/output)
  CSV_PATH        — CSV с кропами (default: OUTPUT_DIR/dataset.csv)
  EXPLAIN_SAMPLES — сколько снимков объяснять (default: 6)
  SHAP_BACKGROUND — размер фонового батча для SHAP (default: 32)
  LIME_NUM_SAMPLES  — итераций LIME (default: 500)
  LIME_NUM_FEATURES — регионов LIME (default: 8)
  DEVICE          — cuda / cpu
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
import pandas as pd

import albumentations as A
from albumentations.pytorch import ToTensorV2

from model import DentalNet, DentalNetConfig

CLASS_NAMES = ["Unhealthy", "Healthy"]


# ── Transforms ─────────────────────────────────────────────────────────────

def _val_tf(img_size: int):
    return A.Compose([
        A.Resize(img_size, img_size),
        A.Normalize(mean=[0.485, 0.456, 0.406], std=[0.229, 0.224, 0.225]),
        ToTensorV2(),
    ])


# ── Загрузка чекпойнта ─────────────────────────────────────────────────────

def load_checkpoint(path: Path, device: torch.device):
    ckpt = torch.load(path, map_location="cpu")
    cfg: DentalNetConfig = ckpt["cfg"]
    img_size: int = ckpt["img_size"]
    model = DentalNet(cfg).to(device)
    model.load_state_dict(ckpt["state_dict"])
    model.eval()
    return model, img_size


# ── Вспомогательные функции ────────────────────────────────────────────────

def tensor_to_uint8(t: torch.Tensor) -> np.ndarray:
    """(C, H, W) нормализованный → uint8 RGB (H, W, C)."""
    mean = np.array([0.485, 0.456, 0.406], dtype=np.float32)
    std  = np.array([0.229, 0.224, 0.225], dtype=np.float32)
    arr  = t.cpu().numpy().transpose(1, 2, 0)          # (H, W, C)
    arr  = np.clip(arr * std + mean, 0, 1)
    return (arr * 255).astype(np.uint8)


def predict_proba_batch(model: nn.Module, images_uint8: list[np.ndarray],
                         tf, device: torch.device) -> np.ndarray:
    """Возвращает (N, 2) — вероятности [Unhealthy, Healthy]."""
    tensors = [tf(image=img)["image"] for img in images_uint8]
    batch   = torch.stack(tensors).to(device)
    with torch.no_grad():
        logits = model(batch).squeeze(1)             # (N,)
        probs_healthy = torch.sigmoid(logits).cpu().numpy()
    probs = np.stack([1 - probs_healthy, probs_healthy], axis=1)  # (N, 2)
    return probs


def make_lime_fn(model, tf, device):
    def fn(images: np.ndarray) -> np.ndarray:
        return predict_proba_batch(model, list(images), tf, device)
    return fn


# ── SHAP ───────────────────────────────────────────────────────────────────

def save_shap(
    model: nn.Module,
    tensor: torch.Tensor,
    image_uint8: np.ndarray,
    background: torch.Tensor,
    pred_idx: int,
    pred_name: str,
    true_name: str,
    out_path: Path,
    device: torch.device,
) -> None:
    """
    Для бинарного BCEWithLogitsLoss SHAP возвращает один массив на единственный выход.
    Оборачиваем модель в wrapper, который возвращает 2 нейрона [p_unhealthy, p_healthy].
    """

    class BinaryWrapper(nn.Module):
        def __init__(self, base: nn.Module):
            super().__init__()
            self.base = base

        def forward(self, x: torch.Tensor) -> torch.Tensor:
            logit = self.base(x).squeeze(1)              # (N,)
            p = torch.sigmoid(logit)
            return torch.stack([1 - p, p], dim=1)        # (N, 2)

    wrapped = BinaryWrapper(model).eval().to(device)
    inp = tensor.unsqueeze(0).to(device)

    explainer = shap.GradientExplainer(wrapped, background)
    shap_values = explainer.shap_values(inp)

    # shap_values: список из 2 массивов (1, C, H, W) или ndarray (1, C, H, W, 2)
    if isinstance(shap_values, list):
        sv = shap_values[pred_idx][0]                    # (C, H, W)
    elif isinstance(shap_values, np.ndarray):
        if shap_values.ndim == 5:                        # (1, C, H, W, 2)
            sv = shap_values[0, :, :, :, pred_idx]
        else:
            sv = shap_values[0]
    else:
        sv = np.array(shap_values)

    sv_mean = np.abs(sv).mean(axis=0)                   # (H, W)
    sv_norm = sv_mean / (sv_mean.max() + 1e-8)

    # Приводим image_uint8 к размеру SHAP-маски (модель могла ресайзить кроп)
    h_shap, w_shap = sv_norm.shape
    display_img = np.array(
        Image.fromarray(image_uint8).resize((w_shap, h_shap), Image.BILINEAR)
    )

    title_color = "green" if true_name == pred_name else "red"
    fig, axes = plt.subplots(1, 3, figsize=(15, 5))

    axes[0].imshow(display_img)
    axes[0].set_title(f"Исходное\ntrue: {true_name}", fontsize=10)
    axes[0].axis("off")

    im = axes[1].imshow(sv_norm, cmap="hot")
    axes[1].set_title(f"SHAP heatmap\npred: {pred_name}", fontsize=10, color=title_color)
    axes[1].axis("off")
    fig.colorbar(im, ax=axes[1], fraction=0.046)

    overlay = display_img.astype(np.float32) / 255.0
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
    pred_name: str,
    true_name: str,
    out_path: Path,
    num_samples: int,
    num_features: int,
    img_size: int = 128,
) -> None:
    # LIME ожидает квадратное изображение того же размера, что и predict_fn
    h, w = image_uint8.shape[:2]
    if h != img_size or w != img_size:
        image_uint8 = np.array(
            Image.fromarray(image_uint8).resize((img_size, img_size), Image.BILINEAR)
        )

    explainer = lime_image.LimeImageExplainer()
    explanation = explainer.explain_instance(
        image_uint8, predict_fn,
        top_labels=2, hide_color=0, num_samples=num_samples,
    )

    _, mask_pos = explanation.get_image_and_mask(
        pred_idx, positive_only=True, num_features=num_features, hide_rest=False,
    )
    _, mask_neg = explanation.get_image_and_mask(
        pred_idx, positive_only=False, negative_only=True, num_features=num_features, hide_rest=False,
    )

    overlay = image_uint8.astype(np.float32).copy()
    overlay[mask_pos == 1, 1] = np.clip(overlay[mask_pos == 1, 1] * 0.5 + 180, 0, 255)
    overlay[mask_pos == 1, 0] = overlay[mask_pos == 1, 0] * 0.5
    overlay[mask_pos == 1, 2] = overlay[mask_pos == 1, 2] * 0.5
    overlay[mask_neg == 1, 0] = np.clip(overlay[mask_neg == 1, 0] * 0.5 + 180, 0, 255)
    overlay[mask_neg == 1, 1] = overlay[mask_neg == 1, 1] * 0.5
    overlay[mask_neg == 1, 2] = overlay[mask_neg == 1, 2] * 0.5
    overlay = np.clip(overlay, 0, 255).astype(np.uint8)

    title_color = "green" if true_name == pred_name else "red"
    fig, axes = plt.subplots(1, 2, figsize=(13, 5))
    axes[0].imshow(image_uint8)
    axes[0].set_title(f"Исходное\ntrue: {true_name}", fontsize=10)
    axes[0].axis("off")
    axes[1].imshow(overlay)
    axes[1].set_title(
        f"LIME → {pred_name}\n■ зелёный = за  ■ красный = против",
        fontsize=10, color=title_color,
    )
    axes[1].axis("off")
    fig.tight_layout()
    fig.savefig(out_path, dpi=130, bbox_inches="tight")
    plt.close(fig)


# ── Main ───────────────────────────────────────────────────────────────────

def main() -> None:
    out_dir    = Path(os.getenv("OUTPUT_DIR", "/data/output"))
    ckpt_name  = os.getenv("CHECKPOINT", "dentalnet.pt")
    ckpt_path  = out_dir / ckpt_name
    if not ckpt_path.is_file():
        for fb in ("dentalnet_dropout0.5.pt", "dentalnet_dropout0.2.pt"):
            fb_path = out_dir / fb
            if fb_path.is_file():
                ckpt_path = fb_path
                print(f"[explain] Фолбэк: {fb}")
                break

    csv_path       = Path(os.getenv("CSV_PATH", str(out_dir / "dataset.csv")))
    n_samples      = int(os.getenv("EXPLAIN_SAMPLES", "6"))
    shap_bg        = int(os.getenv("SHAP_BACKGROUND", "32"))
    lime_samples   = int(os.getenv("LIME_NUM_SAMPLES", "500"))
    lime_features  = int(os.getenv("LIME_NUM_FEATURES", "8"))
    seed           = int(os.getenv("SEED", "42"))
    device         = torch.device(os.getenv("DEVICE", "cuda" if torch.cuda.is_available() else "cpu"))

    explain_dir = out_dir / "explain"
    explain_dir.mkdir(parents=True, exist_ok=True)

    print(f"Device     : {device}")
    print(f"Checkpoint : {ckpt_path}")
    print(f"CSV        : {csv_path}")

    model, img_size = load_checkpoint(ckpt_path, device)
    tf = _val_tf(img_size)
    predict_fn = make_lime_fn(model, tf, device)

    # ── собираем семплы: равномерно по классам, чередуем ──────────────────
    df = pd.read_csv(csv_path)

    per_class = max(1, n_samples // 2)
    samples: list[tuple[np.ndarray, int, str]] = []
    buckets: dict[int, list] = {}
    for label in [0, 1]:
        rows = df[df["label"] == label]
        if rows.empty:
            continue
        pick = rows.sample(min(per_class, len(rows)), random_state=seed)
        bucket = []
        for _, row in pick.iterrows():
            try:
                arr = np.array(Image.open(row["path"]).convert("RGB"))
                bucket.append((arr, int(row["label"]), row["path"]))
            except Exception as e:
                print(f"  Пропускаю {row['path']}: {e}")
        buckets[label] = bucket

    # чередуем классы: Unhealthy, Healthy, Unhealthy, ...
    max_len = max((len(v) for v in buckets.values()), default=0)
    for i in range(max_len):
        for label in [0, 1]:
            if i < len(buckets.get(label, [])):
                samples.append(buckets[label][i])
    if not samples:
        raise RuntimeError("Нет семплов для объяснений. Проверь CSV_PATH.")

    # ── SHAP background (случайные кропы) ──────────────────────────────────
    bg_rows = df.sample(min(shap_bg, len(df)), random_state=seed)
    bg_tensors = []
    for _, row in bg_rows.iterrows():
        try:
            arr = np.array(Image.open(row["path"]).convert("RGB"))
            bg_tensors.append(tf(image=arr)["image"])
        except Exception:
            pass
    background = torch.stack(bg_tensors).to(device) if bg_tensors else None
    if background is None:
        raise RuntimeError("Не удалось собрать background для SHAP.")
    print(f"Семплов: {len(samples)}  SHAP background: {background.shape[0]}")

    records = []
    for i, (img_uint8, true_label, path) in enumerate(samples):
        probs = predict_proba_batch(model, [img_uint8], tf, device)[0]  # (2,)
        pred_idx  = int(np.argmax(probs))
        pred_name = CLASS_NAMES[pred_idx]
        true_name = CLASS_NAMES[true_label]

        tensor = tf(image=img_uint8)["image"]
        prefix = explain_dir / f"sample_{i}"
        Image.fromarray(img_uint8).save(f"{prefix}_original.png")

        print(f"[{i+1}/{len(samples)}] LIME  {Path(path).name}  "
              f"true={true_name}  pred={pred_name}  p={probs[pred_idx]:.3f}")
        save_lime(img_uint8, predict_fn, pred_idx, pred_name, true_name,
                  Path(f"{prefix}_lime.png"), lime_samples, lime_features,
                  img_size=img_size)

        print(f"[{i+1}/{len(samples)}] SHAP  {Path(path).name}")
        save_shap(model, tensor, img_uint8, background, pred_idx, pred_name, true_name,
                  Path(f"{prefix}_shap.png"), device)

        records.append({
            "index": i, "image_path": path,
            "true_class": true_name, "predicted_class": pred_name,
            "correct": true_name == pred_name,
            "p_unhealthy": round(float(probs[0]), 4),
            "p_healthy":   round(float(probs[1]), 4),
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
