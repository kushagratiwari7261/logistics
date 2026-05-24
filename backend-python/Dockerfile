FROM python:3.10-slim-bullseye

# Install compilers and library dependencies required for OpenCV / TensorFlow / dlib
RUN apt-get update && apt-get install -y \
    build-essential \
    cmake \
    gfortran \
    libatlas-base-dev \
    libjpeg-dev \
    liblapack-dev \
    libpng-dev \
    && apt-get clean && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy and install python dependencies first (layer-cached)
COPY requirements.txt .
RUN pip install --no-cache-dir --upgrade pip && \
    pip install --no-cache-dir -r requirements.txt

# Copy all source files
COPY . .

# Expose port and start ASGI server
EXPOSE 8000
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]
