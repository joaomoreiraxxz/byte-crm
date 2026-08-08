from pydantic_settings import BaseSettings
from functools import lru_cache


class Settings(BaseSettings):
    """Configuration for the Biometric Microservice."""

    # Database
    DATABASE_URL: str = "postgresql://bytecrm_admin:password@localhost:5432/bytecrm"

    # API Security
    API_KEY: str = "change-me-biometric-api-key"

    # Embedding Encryption
    EMBEDDING_ENCRYPTION_KEY: str = "0" * 64  # 64 hex chars = 32 bytes

    # DeepFace Configuration
    MODEL_NAME: str = "Facenet512"
    DETECTION_BACKEND: str = "retinaface"
    FACE_MATCH_THRESHOLD: float = 0.40  # Cosine distance threshold

    # Server
    WORKERS: int = 2
    DEBUG: bool = False

    class Config:
        env_file = ".env"
        case_sensitive = True


@lru_cache()
def get_settings() -> Settings:
    return Settings()
