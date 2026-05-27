# YOLOv8 — детекция зубных патологий на OPG

Датасет: **Dental OPG (Object Detection) / Augmented Dataset**  
Формат меток: YOLO bounding box (`class_id cx cy w h`)

| Split | Изображений |
|-------|-------------|
| train | 558 |
| valid | 23 |
| test  | 23 |

## Классы (6) — уточните по документации датасета

| ID | Название | Боксов в train |
|----|----------|----------------|
| 0 | BDC-BDR | 853 |
| 1 | Caries | 172 |
| 2 | Fractured-Teeth | 729 |
| 3 | Healthy-Teeth | 69 |
| 4 | Impacted-Teeth | 526 |
| 5 | Infection | 3293 |

Если реальные имена классов отличаются — поправьте `data.yaml`.

## Почему YOLOv8, а не Mask R-CNN

Mask R-CNN требует **полигонные маски** (сегментацию) в аннотациях.  
В этом датасете только **bounding boxes** (YOLO формат).  
YOLOv8 нативно читает YOLO-метки, быстрее обучается и даёт state-of-the-art mAP.

## Запуск

```powershell
cd ml/detection
copy .env.example .env

# GPU (рекомендуется)
docker compose -f docker-compose.yml -f docker-compose.gpu.yml up --build

# CPU
docker compose up --build
```

## Результаты

`ml/detection/output/`:
| Путь | Что внутри |
|------|-----------|
| `best.pt` | лучшие веса |
| `metrics.json` | mAP50, mAP50-95 после обучения |
| `val_metrics.json` | финальная валидация best.pt |
| `opg_detection/yolov8/` | кривые обучения, confusion matrix, PR-curve (ultralytics) |
| `infer_samples/predict/` | bbox-предикты на тест-снимках |
| `gradcam/` | activation map + bbox side-by-side для 6 тест-снимков |

### GradCAM (объяснимость)

`gradcam/<image>_explain.jpg` — два изображения рядом:
- **Левое**: тепловая карта (каждый детектированный бокс — гауссово пятно с интенсивностью = confidence), показывает *где* модель «смотрит»
- **Правое**: стандартный предикт с bbox и метками

## Модели по размеру

| Модель | Параметры | Скорость | mAP (COCO) |
|--------|-----------|----------|------------|
| yolov8n | 3.2M | быстрее всего | 37.3 |
| yolov8s | 11.2M | быстро | 44.9 |
| **yolov8m** | 25.9M | **рекомендуется** | 50.2 |
| yolov8l | 43.7M | медленно | 52.9 |
| yolov8x | 68.2M | медленнее всего | 53.9 |

Для 558 train-снимков `yolov8s` или `yolov8m` — оптимальный баланс.
