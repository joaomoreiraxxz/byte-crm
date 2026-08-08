"""
Face Enrollment Route — POST /enroll

Registers a face embedding for a user by:
1. Validating the image
2. Detecting and extracting face landmarks
3. Generating a 512-dimension embedding (Facenet512)
4. Encrypting the embedding with AES-256-GCM
5. Storing in face_enrollments table
"""

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field
import logging

from app.services.face_service import FaceService
from app.services.embedding_store import EmbeddingStore
from app.config import get_settings

logger = logging.getLogger("biometric.enroll")
router = APIRouter()


class EnrollRequest(BaseModel):
    user_id: str = Field(..., description="UUID of the user to enroll")
    image_base64: str = Field(
        ...,
        description="Base64-encoded face image (JPEG/PNG)",
        min_length=100,
    )


class EnrollResponse(BaseModel):
    success: bool
    enrollment_id: str | None = None
    embedding_dimension: int | None = None
    message: str


@router.post("/enroll", response_model=EnrollResponse)
async def enroll_face(request: EnrollRequest):
    """
    Register a face embedding for biometric authentication.

    The image should contain a single, clear frontal face.
    The resulting embedding is encrypted before storage.
    """
    face_service = FaceService()
    embedding_store = EmbeddingStore()
    settings = get_settings()

    try:
        # Step 1: Liveness check (basic anti-spoofing)
        is_live, liveness_score = face_service.detect_liveness(request.image_base64)
        if not is_live:
            raise HTTPException(
                status_code=400,
                detail={
                    "success": False,
                    "error": "Liveness check failed. Please use a live camera — no printed photos.",
                    "liveness_score": liveness_score,
                },
            )

        # Step 2: Extract face embedding
        embedding = face_service.extract_embedding(request.image_base64)

        if not embedding or len(embedding) == 0:
            raise HTTPException(
                status_code=400,
                detail={"success": False, "error": "Could not extract face embedding"},
            )

        # Step 3: Save encrypted embedding
        enrollment_id = embedding_store.save_enrollment(
            user_id=request.user_id,
            embedding=embedding,
            model_name=settings.MODEL_NAME,
            detector_backend=settings.DETECTION_BACKEND,
        )

        logger.info(
            f"Face enrolled for user {request.user_id} — "
            f"embedding dim: {len(embedding)}"
        )

        return EnrollResponse(
            success=True,
            enrollment_id=enrollment_id,
            embedding_dimension=len(embedding),
            message="Face enrolled successfully",
        )

    except HTTPException:
        raise
    except ValueError as ve:
        logger.warning(f"Enrollment validation error: {ve}")
        raise HTTPException(
            status_code=400,
            detail={"success": False, "error": str(ve)},
        )
    except Exception as e:
        logger.error(f"Enrollment error for user {request.user_id}: {e}", exc_info=True)
        raise HTTPException(
            status_code=500,
            detail={"success": False, "error": "Face enrollment failed"},
        )
