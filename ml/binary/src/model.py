"""DentalNet — бинарная классификация зубов (Healthy / Unhealthy)."""
from __future__ import annotations

from dataclasses import dataclass, field

import torch
import torch.nn as nn


# ── CBAM Attention ─────────────────────────────────────────────────────────

class ChannelAttention(nn.Module):
    def __init__(self, in_planes: int, ratio: int = 16):
        super().__init__()
        reduced = max(in_planes // ratio, 4)
        self.avg_pool = nn.AdaptiveAvgPool2d(1)
        self.max_pool = nn.AdaptiveMaxPool2d(1)
        self.fc1 = nn.Conv2d(in_planes, reduced, 1, bias=False)
        self.relu = nn.ReLU()
        self.fc2 = nn.Conv2d(reduced, in_planes, 1, bias=False)
        self.sigmoid = nn.Sigmoid()

    def forward(self, x: torch.Tensor) -> torch.Tensor:
        avg = self.fc2(self.relu(self.fc1(self.avg_pool(x))))
        mx  = self.fc2(self.relu(self.fc1(self.max_pool(x))))
        return self.sigmoid(avg + mx)


class SpatialAttention(nn.Module):
    def __init__(self, kernel_size: int = 7):
        super().__init__()
        pad = 3 if kernel_size == 7 else 1
        self.conv = nn.Conv2d(2, 1, kernel_size, padding=pad, bias=False)
        self.sigmoid = nn.Sigmoid()

    def forward(self, x: torch.Tensor) -> torch.Tensor:
        avg = torch.mean(x, dim=1, keepdim=True)
        mx, _ = torch.max(x, dim=1, keepdim=True)
        return self.sigmoid(self.conv(torch.cat([avg, mx], dim=1)))


class CBAM(nn.Module):
    def __init__(self, in_planes: int, ratio: int = 16):
        super().__init__()
        self.ca = ChannelAttention(in_planes, ratio)
        self.sa = SpatialAttention()

    def forward(self, x: torch.Tensor) -> torch.Tensor:
        x = x * self.ca(x)
        return x * self.sa(x)


# ── DentalNet ──────────────────────────────────────────────────────────────

@dataclass
class DentalNetConfig:
    filters: list[int]      = field(default_factory=lambda: [16, 32, 64, 128])
    fc_units: int           = 128
    dropout: float          = 0.5
    lr: float               = 5e-4
    use_attention: bool     = True
    use_scheduler: bool     = True

    @classmethod
    def from_env(cls) -> DentalNetConfig:
        import os
        def _list_int(name: str, default: list[int]) -> list[int]:
            raw = os.getenv(name)
            if not raw:
                return default
            return [int(x.strip()) for x in raw.split(",") if x.strip()]
        return cls(
            filters=_list_int("FILTERS", [16, 32, 64, 128]),
            fc_units=int(os.getenv("FC_UNITS", "128")),
            dropout=float(os.getenv("DROPOUT", "0.5")),
            lr=float(os.getenv("LEARNING_RATE", "5e-4")),
            use_attention=os.getenv("USE_ATTENTION", "true").lower() in ("1","true","yes"),
            use_scheduler=os.getenv("USE_SCHEDULER", "true").lower() in ("1","true","yes"),
        )


class DentalNet(nn.Module):
    def __init__(self, cfg: DentalNetConfig):
        super().__init__()
        self.cfg = cfg
        layers: list[nn.Module] = []
        in_ch = 3
        for out_ch in cfg.filters:
            layers.append(nn.Sequential(
                nn.Conv2d(in_ch, out_ch, 3, padding=1, bias=False),
                nn.BatchNorm2d(out_ch),
                nn.Mish(),
                nn.MaxPool2d(2),
            ))
            if cfg.use_attention:
                layers.append(CBAM(out_ch))
            in_ch = out_ch

        self.features = nn.Sequential(*layers)
        self.gap = nn.AdaptiveAvgPool2d(1)
        self.classifier = nn.Sequential(
            nn.Flatten(),
            nn.Dropout(cfg.dropout),
            nn.Linear(in_ch, cfg.fc_units),
            nn.Mish(),
            nn.Dropout(cfg.dropout / 2),
            nn.Linear(cfg.fc_units, 1),
        )
        self._init_weights()

    def _init_weights(self) -> None:
        for m in self.modules():
            if isinstance(m, nn.Conv2d):
                nn.init.kaiming_normal_(m.weight, mode="fan_out", nonlinearity="relu")
            elif isinstance(m, nn.Linear):
                nn.init.xavier_normal_(m.weight)

    def forward(self, x: torch.Tensor) -> torch.Tensor:
        return self.classifier(self.gap(self.features(x)))
