"""
Image processing utilities for the biometric service.
Handles base64 → numpy array conversion with validation.
"""

import base64
import io
import numpy as np
from PIL import Image
import logging

logger = logging.getLogger("biometric.image")

# Maximum image dimensions to prevent DoS via oversized images
MAX_IMAGE_SIZE = 4096
MIN_IMAGE_SIZE = 64
MAX_FILE_SIZE_BYTES = 5 * 1024 * 1024  # 5MB


def base64_to_numpy(image_base64: str) -> np.ndarray:
    """
    Convert a base64-encoded image string to a numpy array (RGB).

    Accepts both raw base64 and data URI format:
    - "iVBORw0KGgo..." (raw)
    - "data:image/jpeg;base64,/9j/4AAQ..." (data URI)

    Args:
        image_base64: Base64-encoded image string

    Returns:
        numpy array of shape (H, W, 3) in RGB format

    Raises:
        ValueError: If image is invalid, too small, or too large
    """
    # Strip data URI prefix if present
    if "," in image_base64:
        image_base64 = image_base64.split(",", 1)[1]

    # Strip whitespace/newlines
    image_base64 = image_base64.strip()

    # Validate base64 length (rough file size check)
    estimated_size = len(image_base64) * 3 / 4
    if estimated_size > MAX_FILE_SIZE_BYTES:
        raise ValueError(
            f"Image too large ({estimated_size / 1024 / 1024:.1f}MB). "
            f"Max: {MAX_FILE_SIZE_BYTES / 1024 / 1024:.0f}MB"
        )

    try:
        # Decode base64
        image_bytes = base64.b64decode(image_base64)

        # Open with Pillow
        image = Image.open(io.BytesIO(image_bytes))

        # Convert to RGB (handles RGBA, grayscale, etc.)
        if image.mode != "RGB":
            image = image.convert("RGB")

        # Validate dimensions
        width, height = image.size

        if width < MIN_IMAGE_SIZE or height < MIN_IMAGE_SIZE:
            raise ValueError(
                f"Image too small ({width}x{height}). "
                f"Minimum: {MIN_IMAGE_SIZE}x{MIN_IMAGE_SIZE}"
            )

        if width > MAX_IMAGE_SIZE or height > MAX_IMAGE_SIZE:
            # Resize to max dimensions while maintaining aspect ratio
            image.thumbnail((MAX_IMAGE_SIZE, MAX_IMAGE_SIZE), Image.Resampling.LANCZOS)
            logger.info(
                f"Image resized from {width}x{height} to {image.size[0]}x{image.size[1]}"
            )

        # Convert to numpy array
        img_array = np.array(image, dtype=np.uint8)

        logger.debug(f"Image processed: {img_array.shape}, dtype: {img_array.dtype}")

        return img_array

    except base64.binascii.Error:
        raise ValueError("Invalid base64 encoding")
    except Exception as e:
        if "cannot identify image" in str(e).lower():
            raise ValueError("Invalid image format. Supported: JPEG, PNG, WebP")
        raise ValueError(f"Image processing error: {str(e)}")


def numpy_to_base64(img_array: np.ndarray, format: str = "JPEG") -> str:
    """
    Convert a numpy array back to base64-encoded string.
    Useful for returning processed images.
    """
    image = Image.fromarray(img_array)
    buffer = io.BytesIO()
    image.save(buffer, format=format, quality=85)
    buffer.seek(0)
    return base64.b64encode(buffer.read()).decode("utf-8")
