from __future__ import annotations

import os

import torch


def resolve_device() -> torch.device:
    """
    DEVICE=cuda|cpu — принудительный выбор.
    Иначе: cuda, если PyTorch собран с CUDA и драйвер виден в контейнере.
    """
    forced = os.getenv("DEVICE", "").strip().lower()

    if forced == "cpu":
        return torch.device("cpu")
    if forced == "cuda":
        if not torch.cuda.is_available():
            raise RuntimeError(
                "Задано DEVICE=cuda, но torch.cuda.is_available() == False. "
                "Соберите образ Dockerfile.gpu и запустите: docker compose -f docker-compose.yml -f docker-compose.gpu.yml up --build"
            )
        return torch.device("cuda")

    if torch.cuda.is_available():
        return torch.device("cuda")
    return torch.device("cpu")


def print_device_info(device: torch.device) -> None:
    print(f"PyTorch {torch.__version__}, torch.version.cuda={torch.version.cuda}")
    print(f"Device: {device}")

    if device.type == "cuda":
        print(f"GPU: {torch.cuda.get_device_name(0)}")
        props = torch.cuda.get_device_properties(0)
        print(f"VRAM: {props.total_memory / 1024**3:.1f} GB")
        return

    print("Режим CPU.")
    if torch.version.cuda is None:
        print(
            "Причина: установлен CPU-only PyTorch (образ python:3.12-slim + pip install torch). "
            "Для GPU: docker compose -f docker-compose.yml -f docker-compose.gpu.yml up --build"
        )
    elif not torch.cuda.is_available():
        print(
            "Причина: PyTorch с CUDA есть, но GPU не проброшен в контейнер. "
            "Нужны NVIDIA Driver + Docker Desktop (WSL2) + compose с gpus: all."
        )
