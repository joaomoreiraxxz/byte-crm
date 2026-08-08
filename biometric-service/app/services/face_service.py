"""
FaceService — DeepFace wrapper for face enrollment and verification.

Uses Facenet512 for high-accuracy embeddings and RetinaFace for detection.
Implements singleton pattern to keep the model loaded in memory.
"""

import numpy as np
from deepface import DeepFace
import logging
from typing import Optional
import threading

from app.config import get_settings
from app.utils.image_processing import base64_to_numpy

logger = logging.getLogger("biometric.face_service")

_lock = threading.Lock()


class FaceService:
    """Singleton face recognition service using DeepFace."""

    _instance: Optional["FaceService"] = None
    _model_loaded: bool = False

    def __new__(cls) -> "FaceService":
        if cls._instance is None:
            with _lock:
                if cls._instance is None:
                    cls._instance = super().__new__(cls)
        return cls._instance

    def __init__(self):
        if not hasattr(self, "_initialized"):
            self.settings = get_settings()
            self.model_name = self.settings.MODEL_NAME
            self.detector_backend = self.settings.DETECTION_BACKEND
            self.threshold = self.settings.FACE_MATCH_THRESHOLD
            self._initialized = True

    def warm_up(self):
        """Pre-load the model by running a dummy inference."""
        if not FaceService._model_loaded:
            try:
                # Create a dummy image to trigger model download/load
                dummy = np.zeros((224, 224, 3), dtype=np.uint8)
                dummy[50:150, 50:150] = 200  # Add some "face-like" region
                DeepFace.represent(
                    img_path=dummy,
                    model_name=self.model_name,
                    enforce_detection=False,
                )
                FaceService._model_loaded = True
                logger.info(f"Model {self.model_name} loaded successfully")
            except Exception as e:
                logger.warning(f"Model warm-up warning (non-critical): {e}")
                FaceService._model_loaded = True  # Mark as loaded anyway

    def extract_embedding(self, image_base64: str) -> list[float]:
        """
        Extract a face embedding from a base64-encoded image.

        Args:
            image_base64: Base64-encoded image string (with or without data URI prefix)

        Returns:
            List of floats representing the face embedding vector

        Raises:
            ValueError: If no face is detected in the image
        """
        img_array = base64_to_numpy(image_base64)

        logger.info(
            f"Extracting embedding — image shape: {img_array.shape}, "
            f"model: {self.model_name}"
        )

        try:
            results = DeepFace.represent(
                img_path=img_array,
                model_name=self.model_name,
                detector_backend=self.detector_backend,
                enforce_detection=True,
                align=True,
            )

            if not results or len(results) == 0:
                raise ValueError("No face detected in the image")

            # Take the first (most prominent) face
            embedding = results[0]["embedding"]
            face_confidence = results[0].get("face_confidence", 0)

            logger.info(
                f"Embedding extracted — dimension: {len(embedding)}, "
                f"face confidence: {face_confidence:.3f}"
            )

            return embedding

        except ValueError as ve:
            logger.error(f"Face detection failed: {ve}")
            raise ValueError(f"Face detection failed: {str(ve)}")
        except Exception as e:
            logger.error(f"Embedding extraction error: {e}")
            raise RuntimeError(f"Face processing error: {str(e)}")

    def verify_embedding(
        self,
        live_embedding: list[float],
        stored_embedding: list[float],
    ) -> tuple[bool, float]:
        """
        Compare two face embeddings using cosine similarity.

        Args:
            live_embedding: Embedding from the live camera snapshot
            stored_embedding: Embedding stored during enrollment

        Returns:
            Tuple of (match: bool, confidence: float)
            - match: True if cosine distance is below threshold
            - confidence: Similarity score (0.0 to 1.0, higher = more similar)
        """
        vec1 = np.array(live_embedding, dtype=np.float64)
        vec2 = np.array(stored_embedding, dtype=np.float64)

        # Cosine similarity
        dot_product = np.dot(vec1, vec2)
        norm1 = np.linalg.norm(vec1)
        norm2 = np.linalg.norm(vec2)

        if norm1 == 0 or norm2 == 0:
            return False, 0.0

        cosine_similarity = dot_product / (norm1 * norm2)
        cosine_distance = 1.0 - cosine_similarity

        # Convert to confidence score (0 distance = 1.0 confidence)
        confidence = max(0.0, min(1.0, 1.0 - cosine_distance))

        is_match = cosine_distance < self.threshold

        logger.info(
            f"Verification — distance: {cosine_distance:.4f}, "
            f"threshold: {self.threshold}, "
            f"confidence: {confidence:.4f}, "
            f"match: {is_match}"
        )

        return is_match, float(confidence)

    def detect_liveness(self, image_base64: str) -> tuple[bool, float]:
        """
        Basic liveness detection using texture analysis.
        Checks if the image appears to be a real face vs a printed photo.

        This is a basic implementation. Production systems should use
        dedicated anti-spoofing models (e.g., MiniFASNet).

        Returns:
            Tuple of (is_live: bool, score: float)
        """
        img_array = base64_to_numpy(image_base64)

        try:
            import cv2

            # Convert to grayscale
            gray = cv2.cvtColor(img_array, cv2.COLOR_RGB2GRAY)

            # Laplacian variance — measures image sharpness
            # Real faces have more texture/detail than printed photos
            laplacian_var = cv2.Laplacian(gray, cv2.CV_64F).var()

            # Threshold for liveness (empirically determined)
            # Low variance = blurry/flat = likely a photo
            is_live = laplacian_var > 50.0
            score = min(1.0, laplacian_var / 200.0)

            logger.info(
                f"Liveness check — Laplacian variance: {laplacian_var:.2f}, "
                f"score: {score:.3f}, is_live: {is_live}"
            )

            return is_live, score

        except Exception as e:
            logger.warning(f"Liveness detection failed: {e}")
            # Fail open — don't block if liveness check fails
            return True, 0.5
