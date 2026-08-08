"""
Face Verification Route — POST /verify

Verifies a live face snapshot against a stored enrollment by:
1. Loading the user's encrypted embedding from the database
2. Decrypting the stored embedding
3. Extracting an embedding from the live image
4. Comparing both embeddings using cosine similarity
5. Returning match/no-match with confidence score
"""

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field
import logging

from app.services.face_service import FaceService
from app.services.embedding_store import EmbeddingStore

logger = logging.getLogger("biometric.verify")
router = APIRouter()


class VerifyRequest(BaseModel):
    user_id: str = Field(..., description="UUID of the user to verify against")
    image_base64: str = Field(
        ...,
        description="Base64-encoded live camera snapshot",
        min_length=100,
    )


class VerifyResponse(BaseModel):
    success: bool
    match: bool
    confidence: float = Field(
        ..., description="Similarity score (0.0 to 1.0)", ge=0.0, le=1.0
    )
    message: str
    liveness_score: float | None = None


@router.post("/verify", response_model=VerifyResponse)
async def verify_face(request: VerifyRequest):
    """
    Verify a live face snapshot against the user's stored enrollment.

    Returns match status and confidence score.
    Both must pass the threshold for the vault to unlock.
    """
    face_service = FaceService()
    embedding_store = EmbeddingStore()

    try:
        # Step 1: Load stored enrollment
        enrollment = embedding_store.get_enrollment(request.user_id)
        if not enrollment:
            raise HTTPException(
                status_code=404,
                detail={
                    "success": False,
                    "match": False,
                    "confidence": 0.0,
                    "error": "No face enrollment found for this user",
                },
            )

        stored_embedding = enrollment["embedding"]

        # Step 2: Liveness check
        is_live, liveness_score = face_service.detect_liveness(request.image_base64)
        if not is_live:
            logger.warning(
                f"Liveness check failed for user {request.user_id} "
                f"(score: {liveness_score:.3f})"
            )
            return VerifyResponse(
                success=True,
                match=False,
                confidence=0.0,
                message="Liveness check failed — use a live camera",
                liveness_score=liveness_score,
            )

        # Step 3: Extract live embedding
        live_embedding = face_service.extract_embedding(request.image_base64)

        # Step 4: Compare embeddings
        is_match, confidence = face_service.verify_embedding(
            live_embedding=live_embedding,
            stored_embedding=stored_embedding,
        )

        logger.info(
            f"Verification for user {request.user_id}: "
            f"match={is_match}, confidence={confidence:.4f}"
        )

        return VerifyResponse(
            success=True,
            match=is_match,
            confidence=round(confidence, 4),
            message="Face verified successfully" if is_match else "Face does not match",
            liveness_score=round(liveness_score, 3),
        )

    except HTTPException:
        raise
    except ValueError as ve:
        logger.warning(f"Verification validation error: {ve}")
        return VerifyResponse(
            success=True,
            match=False,
            confidence=0.0,
            message=f"Verification failed: {str(ve)}",
        )
    except Exception as e:
        logger.error(
            f"Verification error for user {request.user_id}: {e}", exc_info=True
        )
        raise HTTPException(
            status_code=500,
            detail={
                "success": False,
                "match": False,
                "confidence": 0.0,
                "error": "Face verification service error",
            },
        )
