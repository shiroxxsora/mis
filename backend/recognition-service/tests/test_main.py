from unittest.mock import MagicMock

import pytest
from fastapi.testclient import TestClient

import main
from inference import PredictionWithExplain


@pytest.fixture
def client_no_model():
    with TestClient(main.app) as client:
        main._engine = None
        main._model_error = "checkpoint missing"
        yield client
    main._engine = None
    main._model_error = None


@pytest.fixture
def client_with_model():
    mock_engine = MagicMock()
    mock_engine.predict_payload.return_value = PredictionWithExplain(
        label="Healthy",
        confidence=0.91,
        prob_healthy=0.91,
        shap_image_base64="shap-png",
        lime_image_base64="lime-png",
    )
    with TestClient(main.app) as client:
        main._engine = mock_engine
        main._model_error = None
        yield client
    main._engine = None
    main._model_error = None


def test_api_health_without_model(client_no_model):
    response = client_no_model.get("/api/health")
    assert response.status_code == 200
    body = response.json()
    assert body["service"] == "recognition-service"
    assert body["status"] == "DOWN"
    assert "error" in body


def test_actuator_health_without_model_returns_503(client_no_model):
    response = client_no_model.get("/actuator/health")
    assert response.status_code == 503
    assert response.json()["status"] == "DOWN"


def test_recognize_without_model_returns_503(client_no_model):
    response = client_no_model.post(
        "/api/recognize",
        json={"payload": _valid_payload()},
    )
    assert response.status_code == 503


def test_recognize_demo_payload_returns_400(client_with_model):
    response = client_with_model.post("/api/recognize", json={"payload": "demo"})
    assert response.status_code == 400


@pytest.mark.parametrize("payload", ["stub-payload", "", "   "])
def test_recognize_rejects_invalid_payloads(client_with_model, payload: str):
    response = client_with_model.post("/api/recognize", json={"payload": payload})
    assert response.status_code == 400


def test_recognize_invalid_base64_returns_400(client_with_model):
    main._engine.predict_payload.side_effect = ValueError("payload must be a base64-encoded tooth image")
    response = client_with_model.post("/api/recognize", json={"payload": "not-base64"})
    assert response.status_code == 400


def test_recognize_inference_error_returns_500(client_with_model):
    main._engine.predict_payload.side_effect = RuntimeError("boom")
    response = client_with_model.post("/api/recognize", json={"payload": _valid_payload()})
    assert response.status_code == 500


def test_recognize_valid_payload(client_with_model):
    response = client_with_model.post(
        "/api/recognize",
        json={"payload": _valid_payload()},
    )
    assert response.status_code == 200
    body = response.json()
    assert body["status"] == "completed"
    assert body["label"] == "Healthy"
    assert body["probHealthy"] == pytest.approx(0.91)
    assert body["shapImageBase64"] == "shap-png"
    assert body["limeImageBase64"] == "lime-png"


def _valid_payload() -> str:
    from conftest import png_base64

    return png_base64()
