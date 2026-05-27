# Обучение CNN — классификация OPG



Многоклассовая классификация снимков из **Dental OPG XRAY Dataset → Dental OPG (Classification)**.



## Почему запустилось на CPU?



По умолчанию `docker compose up` собирает **CPU-образ** (`Dockerfile` + `pip install torch` без CUDA).  

В логах будет: `torch.version.cuda=None` и подсказка про GPU-сборку.



## GPU (NVIDIA)



Нужно:



1. Драйвер NVIDIA на Windows

2. Docker Desktop → Settings → **Use WSL 2**, включить GPU

3. Проверка: `docker run --rm --gpus all nvidia/cuda:12.4.0-base-ubuntu22.04 nvidia-smi`



Запуск обучения на GPU:



```powershell

cd ml

docker compose -f docker-compose.yml -f docker-compose.gpu.yml up --build

```



В логах должно быть: `Device: cuda` и имя видеокарты.



## Классы (6)



- BDC-BDR, Caries, Fractured Teeth, Healthy Teeth, Impacted teeth, Infection



## Docker (CPU)



```powershell

cd ml

copy .env.example .env

docker compose up --build

```



## Локально на GPU (без Docker)



```powershell

cd ml\training

python -m venv .venv

.\.venv\Scripts\activate

pip install torch torchvision --index-url https://download.pytorch.org/whl/cu124

pip install Pillow scikit-learn numpy

$env:DATA_DIR="..\..\Dental OPG XRAY Dataset\Dental OPG (Classification)"

$env:OUTPUT_DIR=".\output"

$env:DEVICE="cuda"

cd src

python train.py

```



## Низкий accuracy и растущий val loss

Типично для **~500 снимков / 6 классов**:

- **accuracy ~43%** ≈ baseline (класс Healthy Teeth) — смотрите **macro_f1**
- **растущий val loss** = переобучение (часто из‑за `LEARNING_RATE=0.001`)

Текущий рецепт в `ml/.env`:

| Параметр | Значение |
|----------|----------|
| `LEARNING_RATE` | `0.0003` (не 0.001!) |
| `FREEZE_ENCODER_EPOCHS` | `10` — сначала только голова |
| `MIXUP_ALPHA` | `0.2` |
| `BATCH_SIZE` | `16` |
| Чекпоинты | `best_model.pt` (min val_loss), `best_f1_model.pt` (max macro_f1) |

## Val acc залипает на 0.4327 (только Healthy Teeth)?

На **517 снимках** простая CNN часто не учится и предсказывает majority class (~43%).

**Решение по умолчанию:** `MODEL_BACKBONE=resnet18` + веса ImageNet (`PRETRAINED=true`).

```env
MODEL_BACKBONE=resnet18
LEARNING_RATE=0.0003
BACKBONE_LR_RATIO=0.1
```

Первый запуск скачает веса ResNet (~45 MB). В логах: `Model: resnet18`, разнообразные `val predictions`.

## Функция потерь

По умолчанию **`CrossEntropyLoss`** (с опциональными весами классов):

```env
LOSS_TYPE=cross_entropy
USE_CLASS_WEIGHTS=true
```

Альтернатива при сильном дисбалансе — **Focal Loss**:

```env
LOSS_TYPE=focal
FOCAL_GAMMA=2.0
```

В логах: `Loss: CrossEntropyLoss, weighted` или `FocalLoss(gamma=2.0), weighted`.

## Val accuracy застряла на ~0.43?

В датасете **Healthy Teeth** ≈ 43% всех снимков. Модель без балансировки предсказывает только этот класс → val acc ≈ 0.4327 и не растёт.

Включено по умолчанию:

- `USE_CLASS_WEIGHTS` + **мягкие** веса `CLASS_WEIGHT_POWER=0.5` (sqrt), cap `CLASS_WEIGHT_MAX_RATIO=4`
- `USE_WEIGHTED_SAMPLER=false` — агрессивный oversampling ломал val (все Fractured/Infection)
- лучшая модель по **macro_f1**
- `ReduceLROnPlateau` + early stopping + grad clip

Если снова «залипло» на одном классе: уменьшите `CLASS_WEIGHT_POWER` до `0.25` или `USE_CLASS_WEIGHTS=false`.

## Аугментация (train)

Раньше были только flip + rotation 10°. Сейчас в `augmentation.py`:

- горизонтальный отражение
- поворот, affine (сдвиг/масштаб/сдвиг-сдвиг)
- яркость/контраст (без hue/saturation — для рентгена)
- Gaussian blur (слабый)
- RandomCrop + RandomErasing

**Val, SHAP и LIME** — только resize + normalize, без аугментации.

Отключить: `AUGMENT_ENABLED=false` в `ml/.env`.

## SHAP и LIME

После обучения (`RUN_EXPLAIN=true`) для нескольких val-снимков:

`ml/training/output/explain/` — `sample_N_original.png`, `sample_N_lime.png`, `sample_N_shap.png`, `summary.json`.

Только объяснения (модель уже есть):

```powershell
cd ml\training\src
$env:OUTPUT_DIR="..\output"
$env:DATA_DIR="..\..\Dental OPG XRAY Dataset\Dental OPG (Classification)"
python explain.py
```

Отключить: `RUN_EXPLAIN=false` в `ml/.env`. Ускорить LIME: `LIME_NUM_SAMPLES=150`.

## Артефакты

`ml/training/output/`: `best_model.pt`, `classes.json`, `metrics.json`, `explain/`

## Параметры

См. `ml/.env.example` — `EPOCHS`, `BATCH_SIZE`, `DEVICE`, `RUN_EXPLAIN`, `LIME_NUM_SAMPLES`.

