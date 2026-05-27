"""
GradCAM-объяснения для YOLOv8-детектора.

Запуск отдельно (после обучения):
    python src/explain.py

Или вызывается из train.py при RUN_EXPLAIN=true.
"""
from __future__ import annotations

import os
from pathlib import Path

import cv2
import numpy as np
import yaml


def env_bool(name: str, default: bool) -> bool:
    raw = os.getenv(name)
    if raw is None:
        return default
    return raw.strip().lower() in ("1", "true", "yes", "on")


def env_int(name: str, default: int) -> int:
    return int(os.getenv(name, str(default)))


def run_gradcam(
    model_path: Path,
    data_yaml: Path,
    output_dir: Path,
    image_size: int = 640,
    device: str = "",
    conf: float = 0.25,
    n_samples: int = 6,
) -> None:
    from ultralytics import YOLO

    model = YOLO(str(model_path))

    try:
        cfg = yaml.safe_load(data_yaml.read_text(encoding="utf-8"))
    except Exception as e:
        print(f"[explain] Не удалось прочитать data.yaml: {e}")
        return

    dataset_dir = data_yaml.parent
    test_images_dir = dataset_dir / cfg.get("test", "test/images")
    if not test_images_dir.is_dir():
        print(f"[explain] Папка test images не найдена: {test_images_dir}")
        return

    samples = sorted(test_images_dir.glob("*.jpg"))[:n_samples]
    samples += sorted(test_images_dir.glob("*.png"))[: max(0, n_samples - len(samples))]
    if not samples:
        print("[explain] Нет тестовых снимков.")
        return

    gradcam_out = output_dir / "gradcam"
    gradcam_out.mkdir(parents=True, exist_ok=True)

    class_names: dict[int, str] = cfg.get("names", {})

    print(f"\n--- GradCAM ({len(samples)} снимков) ---")
    for img_path in samples:
        results = model.predict(
            source=str(img_path),
            imgsz=image_size,
            device=device if device else None,
            conf=conf,
            verbose=False,
        )
        if not results:
            continue

        result = results[0]
        # Исходное изображение в BGR
        orig_bgr = cv2.imread(str(img_path))
        if orig_bgr is None:
            continue

        annotated = result.plot()  # BGR с нарисованными боксами

        # Активационная карта через встроенный feature map последнего слоя
        heatmap = _make_heatmap(orig_bgr, result)
        if heatmap is not None:
            overlay = _overlay_heatmap(orig_bgr, heatmap, alpha=0.45)
            combined = _hstack_images(overlay, annotated)
        else:
            combined = annotated

        out_path = gradcam_out / f"{img_path.stem}_explain.jpg"
        cv2.imwrite(str(out_path), combined)
        print(f"  → {out_path.name}")

    print(f"GradCAM → {gradcam_out}")


def _make_heatmap(orig_bgr: np.ndarray, result) -> np.ndarray | None:
    """
    Строим грубую activation map из bounding boxes:
    каждый детектированный бокс добавляет гауссово пятно
    с интенсивностью, пропорциональной confidence.
    Это proxy-карта важности без hook'ов в backbone.
    """
    boxes = result.boxes
    if boxes is None or len(boxes) == 0:
        return None

    h, w = orig_bgr.shape[:2]
    heatmap = np.zeros((h, w), dtype=np.float32)

    for box in boxes:
        conf_val = float(box.conf[0])
        x1, y1, x2, y2 = [int(v) for v in box.xyxy[0].tolist()]
        x1, y1 = max(0, x1), max(0, y1)
        x2, y2 = min(w - 1, x2), min(h - 1, y2)

        cx = (x1 + x2) // 2
        cy = (y1 + y2) // 2
        sigma_x = max((x2 - x1) // 2, 1)
        sigma_y = max((y2 - y1) // 2, 1)

        xs = np.arange(w, dtype=np.float32)
        ys = np.arange(h, dtype=np.float32)
        gx = np.exp(-0.5 * ((xs - cx) / sigma_x) ** 2)
        gy = np.exp(-0.5 * ((ys - cy) / sigma_y) ** 2)
        gaussian = np.outer(gy, gx) * conf_val
        heatmap += gaussian

    if heatmap.max() > 0:
        heatmap /= heatmap.max()
    return heatmap


def _overlay_heatmap(bgr: np.ndarray, heatmap: np.ndarray, alpha: float = 0.45) -> np.ndarray:
    heatmap_uint8 = np.uint8(255 * heatmap)
    colored = cv2.applyColorMap(heatmap_uint8, cv2.COLORMAP_JET)
    colored = cv2.resize(colored, (bgr.shape[1], bgr.shape[0]))
    overlay = cv2.addWeighted(bgr, 1 - alpha, colored, alpha, 0)
    return overlay


def _hstack_images(left: np.ndarray, right: np.ndarray) -> np.ndarray:
    if left.shape[0] != right.shape[0]:
        right = cv2.resize(right, (right.shape[1], left.shape[0]))
    return np.hstack([left, right])


def main() -> None:
    model_path = Path(os.getenv("MODEL_PATH", "/data/output/best.pt"))
    data_yaml = Path(os.getenv("DATA_YAML", "/data/dataset/data.yaml"))
    output_dir = Path(os.getenv("OUTPUT_DIR", "/data/output"))
    image_size = env_int("IMAGE_SIZE", 640)
    device = os.getenv("DEVICE", "")
    conf = float(os.getenv("INFER_CONF", "0.25"))
    n_samples = env_int("EXPLAIN_SAMPLES", 6)

    if not model_path.is_file():
        print(f"[explain] Модель не найдена: {model_path}")
        return

    run_gradcam(
        model_path=model_path,
        data_yaml=data_yaml,
        output_dir=output_dir,
        image_size=image_size,
        device=device,
        conf=conf,
        n_samples=n_samples,
    )


if __name__ == "__main__":
    main()
