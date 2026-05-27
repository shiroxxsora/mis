import base64

import pytest

from conftest import png_base64
from inference import DentalNetInference


def test_decode_plain_base64():
    decoded = DentalNetInference.decode_image_payload(png_base64((12, 10)))
    assert decoded.size == (12, 10)
    assert decoded.mode == "RGB"


def test_decode_data_uri_prefix():
    raw = png_base64()
    payload = f"data:image/png;base64,{raw}"
    decoded = DentalNetInference.decode_image_payload(payload)
    assert decoded.size == (16, 16)


def test_decode_invalid_base64_raises():
    with pytest.raises(ValueError, match="base64"):
        DentalNetInference.decode_image_payload("not-valid-base64!!!")


def test_decode_empty_payload_raises():
    with pytest.raises(ValueError, match="empty"):
        DentalNetInference.decode_image_payload(base64.b64encode(b"").decode())
