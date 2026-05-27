from __future__ import annotations

import os
import uuid
from contextlib import asynccontextmanager
from pathlib import Path
from typing import Any

from fastapi import FastAPI, HTTPException
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field

from inference import DentalNetInference

_engine: DentalNetInference | None = None
_model_error: str | None = None


def _resolve_checkpoint() -> Path:
    output_dir = Path(os.getenv("OUTPUT_DIR", "/models"))
    checkpoint_name = os.getenv("CHECKPOINT", "dentalnet.pt")
    explicit = os.getenv("MODEL_PATH")
    if explicit:
        return Path(explicit)
    return output_dir / checkpoint_name


@asynccontextmanager
async def lifespan(_app: FastAPI):
    global _engine, _model_error
    checkpoint = _resolve_checkpoint()
    try:
        _engine = DentalNetInference(checkpoint)
        _model_error = None
        print(f"[recognition] Loaded DentalNet from {checkpoint}")
    except Exception as exc:
        _engine = None
        _model_error = str(exc)
        print(f"[recognition] Model load failed: {exc}")
    yield


app = FastAPI(title="recognition-service", lifespan=lifespan)


class RecognitionRequest(BaseModel):
    source: str | None = None
    payload: str | None = None


class RecognitionResponse(BaseModel):
    status: str
    message: str
    jobId: str
    label: str | None = None
    confidence: float | None = None
    probHealthy: float | None = Field(default=None, alias="probHealthy")
    shapImageBase64: str | None = Field(default=None, alias="shapImageBase64")
    limeImageBase64: str | None = Field(default=None, alias="limeImageBase64")

    model_config = {"populate_by_name": True}


def _health_payload() -> dict[str, Any]:
    if _engine is not None:
        return {"status": "UP", "model": "loaded"}
    return {"status": "DOWN", "model": "unavailable", "error": _model_error}


@app.get("/api/health")
def api_health() -> dict[str, Any]:
    body = _health_payload()
    return {"service": "recognition-service", **body}


@app.get("/actuator/health")
def actuator_health() -> JSONResponse:
    body = _health_payload()
    if _engine is None:
        return JSONResponse(
            status_code=503,
            content={"status": "DOWN", "components": {"model": body}},
        )
    return JSONResponse(
        status_code=200,
        content={"status": "UP", "components": {"model": body}},
    )


@app.post("/api/recognize", response_model=RecognitionResponse)
def recognize(request: RecognitionRequest | None = None) -> RecognitionResponse:
    job_id = str(uuid.uuid4())

    if _engine is None:
        raise HTTPException(
            status_code=503,
            detail=_model_error or "DentalNet model is not loaded",
        )

    payload = request.payload if request else None
    if not payload or not payload.strip() or payload.strip() in ("demo", "stub-payload"):
        raise HTTPException(
            status_code=400,
            detail="Provide a base64-encoded tooth crop image in payload",
        )

    try:
        prediction = _engine.predict_payload(payload)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Inference failed: {exc}") from exc

    return RecognitionResponse(
        status="completed",
        message=f"{prediction.label} ({prediction.confidence:.1%})",
        jobId=job_id,
        label=prediction.label,
        confidence=round(prediction.confidence, 4),
        probHealthy=round(prediction.prob_healthy, 4),
        shapImageBase64=prediction.shap_image_base64,
        limeImageBase64=prediction.lime_image_base64,
    )
