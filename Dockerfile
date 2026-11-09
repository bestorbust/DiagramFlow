FROM node:22-bookworm-slim AS frontend
WORKDIR /build
COPY frontend/package*.json ./
RUN npm ci
COPY frontend/ ./
RUN npm run build

FROM python:3.12-slim-bookworm
RUN apt-get update && apt-get install -y --no-install-recommends tesseract-ocr libglib2.0-0 && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt
COPY backend/ backend/
COPY cv/src/ cv/src/
COPY llm/ llm/
COPY run_all.py ./
COPY --from=frontend /build/dist/ frontend/dist/
RUN useradd --create-home diagramflow && mkdir -p /app/data /app/backend/static /app/cv/data/diagrams && chown -R diagramflow:diagramflow /app
USER diagramflow
ENV DIAGRAMFLOW_ENV=production DIAGRAMFLOW_HOST=0.0.0.0 PYTHONUNBUFFERED=1
EXPOSE 8000
CMD ["python", "run_all.py"]
