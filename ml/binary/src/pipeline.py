"""
Пайплайн: crop.py → train.py

Env vars:
  DATASET_DIR   — путь к Original Dataset (папка с jpg + txt)
  OUTPUT_DIR    — куда писать кропы, CSV, модели (default /data/output)
  SKIP_CROP     — если "true", пропустить кроп и использовать готовый CSV
  MIN_CROP_SIZE — минимальный размер кропа в пикселях (default 10)
"""
from __future__ import annotations

import os
from pathlib import Path

from crop import run_crop
import train as train_module


def main() -> None:
    dataset_dir = Path(os.getenv("DATASET_DIR", "/data/dataset"))
    output_dir  = Path(os.getenv("OUTPUT_DIR",  "/data/output"))
    skip_crop   = os.getenv("SKIP_CROP", "false").lower() in ("1", "true", "yes")
    min_size    = int(os.getenv("MIN_CROP_SIZE", "10"))

    output_dir.mkdir(parents=True, exist_ok=True)
    csv_path = output_dir / "dataset.csv"

    if skip_crop and csv_path.is_file():
        print(f"[pipeline] Пропуск кропинга, использую готовый CSV: {csv_path}")
    else:
        print("[pipeline] === Шаг 1: кропинг зубов ===")
        csv_path = run_crop(dataset_dir, output_dir, min_size=min_size)

    os.environ["CSV_PATH"] = str(csv_path)
    os.environ["OUTPUT_DIR"] = str(output_dir)

    print("\n[pipeline] === Шаг 2: обучение DentalNet ===")
    train_module.main()


if __name__ == "__main__":
    main()
