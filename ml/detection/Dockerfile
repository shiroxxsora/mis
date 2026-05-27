# CPU-образ: python + ultralytics (torch CPU)
# syntax=docker/dockerfile:1
FROM python:3.12-slim

WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends \
    libgomp1 libgl1 libglib2.0-0 wget \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY src ./src
COPY data.yaml /app/data.yaml

ENV PYTHONUNBUFFERED=1

CMD ["python", "src/train.py"]
