# CPU-образ (по умолчанию). Для GPU см. Dockerfile.gpu + docker-compose.gpu.yml
# syntax=docker/dockerfile:1
FROM python:3.12-slim

WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends \
    libgomp1 \
    && rm -rf /var/lib/apt/lists/*

COPY requirements-cpu.txt requirements.txt
RUN pip install --no-cache-dir -r requirements.txt

COPY src ./src

ENV PYTHONUNBUFFERED=1
WORKDIR /app/src

CMD ["python", "train.py"]
