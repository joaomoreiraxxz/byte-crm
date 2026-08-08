"""
Biometric Microservice — CRM BYTE
FastAPI service for facial recognition using DeepFace (Facenet512).

Endpoints:
- POST /enroll — Register a face embedding for a user
- POST /verify — Verify a face against a stored embedding (1:1)
- GET  /health — Health check
"""

from fastapi import FastAPI, Request, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from contextlib import asynccontextmanager
import time
import logging

from app.config import get_settings
from app.routes.enroll import router as enroll_router
from app.routes.verify import router as verify_router
from app.middleware.api_key_auth import APIKeyMiddleware
from app.services.face_service import FaceService

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
)
logger = logging.getLogger("biometric")


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Pre-load DeepFace model on startup."""
    settings = get_settings()
    logger.info("═" * 50)
    logger.info("  CRM BYTE — Biometric Microservice")
    logger.info("═" * 50)
    logger.info(f"  Model: {settings.MODEL_NAME}")
    logger.info(f"  Detector: {settings.DETECTION_BACKEND}")
    logger.info(f"  Threshold: {settings.FACE_MATCH_THRESHOLD}")

    # Pre-warm the model
    logger.info("  Loading DeepFace model...")
    face_service = FaceService()
    face_service.warm_up()
    logger.info("  ✅ Model loaded and ready")
    logger.info("═" * 50)

    yield

    logger.info("Shutting down biometric service...")


app = FastAPI(
    title="CRM BYTE — Biometric Service",
    description="Facial recognition microservice for the CRM BYTE vault authentication.",
    version="1.0.0",
    lifespan=lifespan,
    docs_url="/docs" if get_settings().DEBUG else None,
    redoc_url=None,
)

# CORS (restricted to internal services)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Internal service — restricted by API key
    allow_methods=["POST", "GET"],
    allow_headers=["*"],
)

# API Key authentication
app.add_middleware(APIKeyMiddleware)


# ─── Request timing middleware ────────────────────────────────
@app.middleware("http")
async def add_process_time(request: Request, call_next):
    start = time.time()
    response = await call_next(request)
    duration = time.time() - start
    response.headers["X-Process-Time"] = f"{duration:.3f}s"
    if duration > 5.0:
        logger.warning(f"Slow request: {request.url.path} took {duration:.2f}s")
    return response


# ─── Health Check ─────────────────────────────────────────────
@app.get("/health")
async def health_check():
    return {
        "status": "ok",
        "service": "biometric-service",
        "model": get_settings().MODEL_NAME,
        "detector": get_settings().DETECTION_BACKEND,
    }


# ─── Mount Routes ─────────────────────────────────────────────
app.include_router(enroll_router, prefix="", tags=["enrollment"])
app.include_router(verify_router, prefix="", tags=["verification"])


# ─── Global Exception Handler ─────────────────────────────────
@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    logger.error(f"Unhandled error on {request.url.path}: {exc}", exc_info=True)
    return JSONResponse(
        status_code=500,
        content={
            "success": False,
            "error": "Internal server error during face processing",
        },
    )
