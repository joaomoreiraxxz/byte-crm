"""
Embedding Store — PostgreSQL storage for encrypted face embeddings.

Embeddings are encrypted with AES-256-GCM before storage.
The encryption key is derived from the EMBEDDING_ENCRYPTION_KEY env var.
"""

import json
import os
from cryptography.hazmat.primitives.ciphers.aead import AESGCM
import psycopg2
from psycopg2.extras import RealDictCursor
import logging

from app.config import get_settings

logger = logging.getLogger("biometric.embedding_store")


class EmbeddingStore:
    """Manages encrypted face embedding storage in PostgreSQL."""

    def __init__(self):
        self.settings = get_settings()
        self._conn = None

    def _get_connection(self):
        """Get or create a database connection."""
        if self._conn is None or self._conn.closed:
            self._conn = psycopg2.connect(
                self.settings.DATABASE_URL,
                cursor_factory=RealDictCursor,
            )
            self._conn.autocommit = True
        return self._conn

    def _encrypt_embedding(self, embedding: list[float]) -> tuple[str, str, str, str]:
        """
        Encrypt an embedding vector using AES-256-GCM.

        Returns:
            Tuple of (ciphertext_hex, iv_hex, tag_hex, salt_hex)
        """
        key = bytes.fromhex(self.settings.EMBEDDING_ENCRYPTION_KEY)
        nonce = os.urandom(12)  # 96-bit nonce for GCM
        salt = os.urandom(16)

        aesgcm = AESGCM(key)
        plaintext = json.dumps(embedding).encode("utf-8")
        ciphertext_with_tag = aesgcm.encrypt(nonce, plaintext, None)

        # GCM appends the 16-byte tag to the ciphertext
        ciphertext = ciphertext_with_tag[:-16]
        tag = ciphertext_with_tag[-16:]

        return (
            ciphertext.hex(),
            nonce.hex(),
            tag.hex(),
            salt.hex(),
        )

    def _decrypt_embedding(
        self, ciphertext_hex: str, iv_hex: str, tag_hex: str
    ) -> list[float]:
        """Decrypt an embedding vector."""
        key = bytes.fromhex(self.settings.EMBEDDING_ENCRYPTION_KEY)
        nonce = bytes.fromhex(iv_hex)
        ciphertext = bytes.fromhex(ciphertext_hex)
        tag = bytes.fromhex(tag_hex)

        aesgcm = AESGCM(key)
        plaintext = aesgcm.decrypt(nonce, ciphertext + tag, None)

        return json.loads(plaintext.decode("utf-8"))

    def save_enrollment(
        self,
        user_id: str,
        embedding: list[float],
        model_name: str,
        detector_backend: str,
    ) -> str:
        """
        Save an encrypted face embedding for a user.
        Deactivates any previous enrollment first.
        """
        conn = self._get_connection()
        ciphertext, iv, tag, salt = self._encrypt_embedding(embedding)

        with conn.cursor() as cur:
            # Deactivate previous enrollment
            cur.execute(
                "UPDATE face_enrollments SET is_active = false WHERE user_id = %s",
                (user_id,),
            )

            # Insert new enrollment
            cur.execute(
                """INSERT INTO face_enrollments (
                    user_id, embedding_encrypted, embedding_iv,
                    embedding_tag, embedding_salt, model_name,
                    detector_backend, is_active
                ) VALUES (%s, %s, %s, %s, %s, %s, %s, true)
                RETURNING id""",
                (user_id, ciphertext, iv, tag, salt, model_name, detector_backend),
            )
            enrollment_id = cur.fetchone()["id"]

            # Update user face_enrolled flag
            cur.execute(
                "UPDATE users SET face_enrolled = true WHERE id = %s",
                (user_id,),
            )

        logger.info(f"Enrollment saved for user {user_id} (id: {enrollment_id})")
        return enrollment_id

    def get_enrollment(self, user_id: str) -> dict | None:
        """
        Get the active face enrollment for a user.
        Returns the decrypted embedding and metadata.
        """
        conn = self._get_connection()

        with conn.cursor() as cur:
            cur.execute(
                """SELECT * FROM face_enrollments
                   WHERE user_id = %s AND is_active = true
                   LIMIT 1""",
                (user_id,),
            )
            row = cur.fetchone()

        if not row:
            return None

        # Decrypt the embedding
        embedding = self._decrypt_embedding(
            row["embedding_encrypted"],
            row["embedding_iv"],
            row["embedding_tag"],
        )

        return {
            "id": row["id"],
            "user_id": row["user_id"],
            "embedding": embedding,
            "model_name": row["model_name"],
            "detector_backend": row["detector_backend"],
            "enrolled_at": str(row["enrolled_at"]),
        }

    def delete_enrollment(self, user_id: str) -> bool:
        """Delete all face enrollments for a user."""
        conn = self._get_connection()

        with conn.cursor() as cur:
            cur.execute(
                "DELETE FROM face_enrollments WHERE user_id = %s", (user_id,)
            )
            cur.execute(
                "UPDATE users SET face_enrolled = false WHERE id = %s", (user_id,)
            )

        logger.info(f"Enrollment deleted for user {user_id}")
        return True
