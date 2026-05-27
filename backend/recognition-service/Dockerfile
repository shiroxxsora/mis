FROM python:3.11-slim

WORKDIR /app

RUN apt-get update \
    && apt-get install -y --no-install-recommends wget \
    && rm -rf /var/lib/apt/lists/*

COPY backend/recognition-service/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY backend/recognition-service/src/ ./src/

ENV PYTHONPATH=/app/src
ENV OUTPUT_DIR=/models
ENV CHECKPOINT=dentalnet.pt
ENV DEVICE=cpu

EXPOSE 8083

CMD ["uvicorn", "main:app", "--app-dir", "/app/src", "--host", "0.0.0.0", "--port", "8083", "--http", "httptools"]
