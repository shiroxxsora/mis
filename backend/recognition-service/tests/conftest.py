import base64
import sys
from io import BytesIO
from pathlib import Path

from PIL import Image

SRC = Path(__file__).resolve().parents[1] / "src"
if str(SRC) not in sys.path:
    sys.path.insert(0, str(SRC))


def png_base64(size: tuple[int, int] = (16, 16)) -> str:
    image = Image.new("RGB", size, color=(10, 20, 30))
    buffer = BytesIO()
    image.save(buffer, format="PNG")
    return base64.b64encode(buffer.getvalue()).decode("ascii")
