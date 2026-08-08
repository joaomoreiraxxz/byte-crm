"""
API Key Authentication Middleware.
Validates the X-API-Key header against the configured API key.
Health check and docs endpoints are excluded.
"""

from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import JSONResponse
import hmac
import logging

from app.config import get_settings

logger = logging.getLogger("biometric.auth")

# Routes that don't require authentication
EXCLUDED_PATHS = {"/health", "/docs", "/openapi.json"}


class APIKeyMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        # Skip auth for health check and docs
        if request.url.path in EXCLUDED_PATHS:
            return await call_next(request)

        # Extract API key from header
        api_key = request.headers.get("X-API-Key") or request.headers.get("x-api-key")

        if not api_key:
            logger.warning(
                f"Missing API key from {request.client.host} on {request.url.path}"
            )
            return JSONResponse(
                status_code=401,
                content={
                    "success": False,
                    "error": "API key required (X-API-Key header)",
                },
            )

        # Timing-safe comparison to prevent timing attacks
        settings = get_settings()
        if not hmac.compare_digest(api_key, settings.API_KEY):
            logger.warning(
                f"Invalid API key from {request.client.host} on {request.url.path}"
            )
            return JSONResponse(
                status_code=403,
                content={"success": False, "error": "Invalid API key"},
            )

        return await call_next(request)
