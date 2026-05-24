FROM python:3.10-slim-bullseye

# Install compilers and library dependencies required for OpenCV / TensorFlow / dlib
RUN apt-get update && apt-get install -y --no-install-recommends \
    libglib2.0-0 \
    && apt-get clean && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy and install python dependencies first (layer-cached)
COPY requirements.txt .
RUN pip install --no-cache-dir --upgrade pip && \
    pip install --no-cache-dir -r requirements.txt

# Copy all source files
COPY . .

# Use dynamic PORT provided by Railway, fallback to 8000
ENV PORT=8000
EXPOSE $PORT
CMD ["sh", "-c", "uvicorn main:app --host 0.0.0.0 --port ${PORT}"]
