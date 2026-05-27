"""
Кропинг отдельных зубов из OPG снимков по YOLO bbox аннотациям.

Использует Original Dataset из Dental OPG (Object Detection).
Сохраняет кропы и CSV-манифест.

CLASS_MAPPING (env UNHEALTHY_CLASSES / HEALTHY_CLASS):
  По умолчанию:
    Unhealthy (0): class 2 (Impacted), class 4 (BDC-BDR)
    Healthy   (1): class 5 (Infection или Healthy — по исходному датасету)
"""
from __future__ import annotations

import csv
import os
from pathlib import Path

from PIL import Image


def _env_list_int(name: str, default: list[int]) -> list[int]:
    raw = os.getenv(name)
    if not raw:
        return default
    return [int(x.strip()) for x in raw.split(",") if x.strip()]


def _build_class_mapping() -> dict[int, int]:
    unhealthy = _env_list_int("UNHEALTHY_CLASSES", [2, 4])
    healthy   = _env_list_int("HEALTHY_CLASSES",   [5])
    mapping: dict[int, int] = {}
    for c in unhealthy:
        mapping[c] = 0
    for c in healthy:
        mapping[c] = 1
    return mapping


def parse_yolo_txt(txt_path: Path) -> list[dict]:
    anns = []
    if not txt_path.is_file():
        return anns
    for line in txt_path.read_text().splitlines():
        parts = line.strip().split()
        if len(parts) >= 5:
            anns.append({
                "class_id": int(parts[0]),
                "cx": float(parts[1]),
                "cy": float(parts[2]),
                "w":  float(parts[3]),
                "h":  float(parts[4]),
            })
    return anns


def crop_tooth(img: Image.Image, cx: float, cy: float, w: float, h: float) -> Image.Image:
    iw, ih = img.size
    x1 = max(0,  int((cx - w / 2) * iw))
    y1 = max(0,  int((cy - h / 2) * ih))
    x2 = min(iw, int((cx + w / 2) * iw))
    y2 = min(ih, int((cy + h / 2) * ih))
    return img.crop((x1, y1, x2, y2))


def run_crop(
    dataset_dir: Path,
    output_dir: Path,
    min_size: int = 10,
) -> Path:
    """Кропает зубы и сохраняет CSV: path,label"""
    class_mapping = _build_class_mapping()
    print(f"Class mapping: {class_mapping}")

    crops_dir = output_dir / "crops"
    crops_dir.mkdir(parents=True, exist_ok=True)

    csv_path = output_dir / "dataset.csv"
    rows: list[tuple[str, int]] = []
    total_imgs = 0
    skipped = 0

    img_files = sorted(dataset_dir.glob("*.jpg")) + sorted(dataset_dir.glob("*.png"))
    print(f"Найдено изображений: {len(img_files)}")

    for img_path in img_files:
        txt_path = img_path.with_suffix(".txt")
        anns = parse_yolo_txt(txt_path)
        if not anns:
            continue

        try:
            img = Image.open(img_path).convert("RGB")
        except Exception as e:
            print(f"  Ошибка загрузки {img_path.name}: {e}")
            continue

        total_imgs += 1
        for i, ann in enumerate(anns):
            cls = ann["class_id"]
            if cls not in class_mapping:
                skipped += 1
                continue

            label = class_mapping[cls]
            crop = crop_tooth(img, ann["cx"], ann["cy"], ann["w"], ann["h"])

            if crop.width < min_size or crop.height < min_size:
                skipped += 1
                continue

            crop_name = f"{img_path.stem}_tooth_{i}_cls{cls}.jpg"
            crop_path = crops_dir / crop_name
            crop.save(crop_path, quality=95)
            rows.append((str(crop_path), label))

    with open(csv_path, "w", newline="", encoding="utf-8") as f:
        writer = csv.writer(f)
        writer.writerow(["path", "label"])
        writer.writerows(rows)

    healthy   = sum(1 for _, l in rows if l == 1)
    unhealthy = sum(1 for _, l in rows if l == 0)
    print(f"Кропов сохранено: {len(rows)}  (healthy={healthy}, unhealthy={unhealthy})")
    print(f"Изображений обработано: {total_imgs}  Пропущено bbox: {skipped}")
    print(f"CSV → {csv_path}")
    return csv_path
