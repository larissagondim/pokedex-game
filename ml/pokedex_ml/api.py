"""HTTP service for win probabilities.

    uvicorn pokedex_ml.api:app --port 8000

The web app computes the features from the battle state (web/lib/battleFeatures.ts,
the same code that built the training data) and posts them here.
"""
from __future__ import annotations

import os
from functools import lru_cache
from pathlib import Path

from fastapi import Depends, FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

from . import model_io

app = FastAPI(title="Pokédex Game win prediction", version="1.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=os.environ.get("CORS_ORIGINS", "http://localhost:3000").split(","),
    allow_methods=["GET", "POST"],
    allow_headers=["Content-Type"],
)


@lru_cache
def get_model() -> model_io.TrainedModel:
    return model_io.load(Path(os.environ.get("MODEL_PATH", model_io.DEFAULT_MODEL_PATH)))


class PredictRequest(BaseModel):
    features: dict[str, float] = Field(description="Feature name → value, from battleFeatures() in the web app.")


class PredictResponse(BaseModel):
    probability: float = Field(ge=0, le=1, description="P(side A wins).")
    model: str
    version: str


class BatchRequest(BaseModel):
    items: list[PredictRequest] = Field(max_length=1000)


@app.get("/health")
def health(model: model_io.TrainedModel = Depends(get_model)) -> dict:
    return {"status": "ok", "model": model.name, "version": model.version, "features": model.features}


def _check(features: dict[str, float], model: model_io.TrainedModel) -> None:
    missing = [f for f in model.features if f not in features]
    if missing:
        raise HTTPException(status_code=422, detail={"missing_features": missing})


@app.post("/predict")
def predict(request: PredictRequest, model: model_io.TrainedModel = Depends(get_model)) -> PredictResponse:
    _check(request.features, model)
    p = float(model.predict([request.features])[0])
    return PredictResponse(probability=p, model=model.name, version=model.version)


@app.post("/predict/batch")
def predict_batch(request: BatchRequest, model: model_io.TrainedModel = Depends(get_model)) -> list[PredictResponse]:
    for item in request.items:
        _check(item.features, model)
    ps = model.predict([item.features for item in request.items]) if request.items else []
    return [PredictResponse(probability=float(p), model=model.name, version=model.version) for p in ps]
