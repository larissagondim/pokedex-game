# Win-prediction service (FastAPI). Build from ml/:
#
#   docker build -t pokedex-ml ml

FROM python:3.12-slim
WORKDIR /app
ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1
COPY requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt
COPY pokedex_ml pokedex_ml
COPY models models
RUN useradd --system app
USER app
EXPOSE 8000
CMD ["uvicorn", "pokedex_ml.api:app", "--host", "0.0.0.0", "--port", "8000"]
