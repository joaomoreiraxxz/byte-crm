FROM python:3.11-slim

WORKDIR /app

# Install system dependencies for OpenCV and dlib
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    cmake \
    libglib2.0-0 \
    libsm6 \
    libxext6 \
    libxrender-dev \
    libgl1-mesa-glx \
    && rm -rf /var/lib/apt/lists/*

# Install Python dependencies
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Pre-download DeepFace models (avoids download on first request)
RUN python -c "from deepface import DeepFace; DeepFace.build_model('Facenet512')"

# Copy application code
COPY app/ ./app/

# Create non-root user
RUN useradd -m -r biometric && chown -R biometric:biometric /app
USER biometric

EXPOSE 8000

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000", "--workers", "2"]
