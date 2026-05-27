from __future__ import annotations

import json
import os
import shutil
from pathlib import Path

from ultralytics import YOLO


def env_int(name: str, default: int) -> int:
    return int(os.getenv(name, str(default)))


def env_float(name: str, default: float) -> float:
    return float(os.getenv(name, str(default)))


def env_bool(name: str, default: bool) -> bool:
    raw = os.getenv(name)
    if raw is None:
        return default
    return raw.strip().lower() in ("1", "true", "yes", "on")


def main() -> None:
    data_yaml = Path(os.getenv("DATA_YAML", "/data/dataset/data.yaml"))
    output_dir = Path(os.getenv("OUTPUT_DIR", "/data/output"))

    model_name = os.getenv("MODEL_NAME", "yolov8m.pt")
    epochs = env_int("EPOCHS", 100)
    image_size = env_int("IMAGE_SIZE", 640)
    batch_size = env_int("BATCH_SIZE", 8)
    patience = env_int("PATIENCE", 20)
    lr0 = env_float("LR0", 3e-3)
    lrf = env_float("LRF", 0.01)
    weight_decay = env_float("WEIGHT_DECAY", 5e-4)
    mosaic = env_float("MOSAIC", 0.5)
    mixup = env_float("MIXUP", 0.0)
    degrees = env_float("DEGREES", 5.0)
    translate = env_float("TRANSLATE", 0.05)
    scale = env_float("SCALE", 0.3)
    fliplr = env_float("FLIPLR", 0.5)
    flipud = env_float("FLIPUD", 0.0)
    hsv_v = env_float("HSV_V", 0.3)
    hsv_s = env_float("HSV_S", 0.0)
    hsv_h = env_float("HSV_H", 0.0)
    workers = env_int("WORKERS", 4)
    device = os.getenv("DEVICE", "")
    project_name = os.getenv("PROJECT_NAME", "opg_detection")
    run_name = os.getenv("RUN_NAME", "yolov8")

    output_dir.mkdir(parents=True, exist_ok=True)

    print(f"Model  : {model_name}")
    print(f"Data   : {data_yaml}")
    print(f"Output : {output_dir}")
    print(f"Epochs : {epochs}  batch={batch_size}  imgsz={image_size}")
    print(f"Device : {device if device else 'auto'}")

    model = YOLO(model_name)

    results = model.train(
        data=str(data_yaml),
        epochs=epochs,
        imgsz=image_size,
        batch=batch_size,
        patience=patience,
        lr0=lr0,
        lrf=lrf,
        weight_decay=weight_decay,
        mosaic=mosaic,
        mixup=mixup,
        degrees=degrees,
        translate=translate,
        scale=scale,
        fliplr=fliplr,
        flipud=flipud,
        hsv_v=hsv_v,
        hsv_s=hsv_s,
        hsv_h=hsv_h,
        workers=workers,
        device=device if device else None,
        project=str(output_dir / project_name),
        name=run_name,
        exist_ok=True,
        verbose=True,
        plots=True,
        save=True,
        save_period=10,
        val=True,
    )

    run_dir = output_dir / project_name / run_name
    best_src = run_dir / "weights" / "best.pt"
    best_dst = output_dir / "best.pt"
    if best_src.is_file():
        shutil.copy2(best_src, best_dst)
        print(f"Best weights → {best_dst}")

    # Метрики
    metrics_path = output_dir / "metrics.json"
    metrics: dict = {}
    if hasattr(results, "results_dict"):
        metrics = {k: round(float(v), 4) for k, v in results.results_dict.items()}
    metrics["model"] = model_name
    metrics["epochs_run"] = epochs
    metrics_path.write_text(json.dumps(metrics, indent=2, ensure_ascii=False), encoding="utf-8")
    print(f"Metrics → {metrics_path}")

    # Валидация финального best.pt
    if best_dst.is_file():
        print("\n--- Validation (best.pt) ---")
        best_model = YOLO(str(best_dst))
        val_res = best_model.val(data=str(data_yaml), imgsz=image_size, device=device if device else None)
        val_metrics: dict = {}
        if hasattr(val_res, "results_dict"):
            val_metrics = {k: round(float(v), 4) for k, v in val_res.results_dict.items()}
        print(val_metrics)
        val_path = output_dir / "val_metrics.json"
        val_path.write_text(json.dumps(val_metrics, indent=2, ensure_ascii=False), encoding="utf-8")

    if env_bool("RUN_INFER_SAMPLES", True):
        _run_sample_inference(best_dst, data_yaml, image_size, device, output_dir)

    if env_bool("RUN_EXPLAIN", True):
        from explain import run_gradcam
        run_gradcam(
            model_path=best_dst,
            data_yaml=data_yaml,
            output_dir=output_dir,
            image_size=image_size,
            device=device,
            conf=float(os.getenv("INFER_CONF", "0.25")),
            n_samples=env_int("EXPLAIN_SAMPLES", 6),
        )


def _run_sample_inference(
    model_path: Path,
    data_yaml: Path,
    image_size: int,
    device: str,
    output_dir: Path,
) -> None:
    """Прогоняем несколько test-снимков и сохраняем предикты."""
    import yaml

    if not model_path.is_file():
        return

    try:
        cfg = yaml.safe_load(data_yaml.read_text())
    except Exception:
        return

    dataset_dir = data_yaml.parent
    test_images = dataset_dir / cfg.get("test", "test/images")
    if not test_images.is_dir():
        return

    samples = sorted(test_images.glob("*.jpg"))[:6] + sorted(test_images.glob("*.png"))[:2]
    if not samples:
        return

    infer_out = output_dir / "infer_samples"
    infer_out.mkdir(parents=True, exist_ok=True)

    model = YOLO(str(model_path))
    print(f"\n--- Sample inference ({len(samples)} images) ---")
    model.predict(
        source=[str(p) for p in samples],
        imgsz=image_size,
        device=device if device else None,
        save=True,
        project=str(infer_out),
        name="predict",
        exist_ok=True,
        conf=float(os.getenv("INFER_CONF", "0.25")),
    )
    print(f"Inference samples → {infer_out}")


if __name__ == "__main__":
    main()
