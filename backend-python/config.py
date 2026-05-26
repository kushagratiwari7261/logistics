import os
import logging
from pydantic_settings import BaseSettings

logger = logging.getLogger(__name__)

class Settings(BaseSettings):
    SUPABASE_URL: str = "https://xgihvwtiaqkpusrdvclk.supabase.co"
    SUPABASE_SERVICE_KEY: str = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InhnaWh2d3RpYXFrcHVzcmR2Y2xrIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MDY1NzcwNiwiZXhwIjoyMDg2MjMzNzA2fQ.AQe3eYb3Co2-Nyw46OSeOu8Vx0f9eCB8ZrrKiFifUu8"
    SUPABASE_JWT_SECRET: str = "e2LZ2y8mvRFXLjB//eoOcAtM1lr5lprYpuEb8uAP/PNx/sOrJPlvXlWwaTIMSQYv3yYUA9wuAieNbkZKXuwaNQ=="

    # Default office location (Noida Corporate Area) as fallback
    OFFICE_LAT: float = 28.5355
    OFFICE_LNG: float = 77.3910
    OFFICE_RADIUS_METERS: float = 100.0

    class Config:
        env_file = ".env"
        env_file_encoding = "utf-8"
        extra = "ignore"

# Load settings from environment variables or .env file
# On Railway, env vars are injected directly — the .env file may not exist
_env_path = os.path.join(os.path.dirname(__file__), ".env")
if os.path.exists(_env_path):
    settings = Settings(_env_file=_env_path)
else:
    settings = Settings()

# Log whether critical vars are present (without revealing values)
logger.info(f"SUPABASE_URL set: {bool(settings.SUPABASE_URL)}")
logger.info(f"SUPABASE_SERVICE_KEY set: {bool(settings.SUPABASE_SERVICE_KEY)}")
logger.info(f"SUPABASE_JWT_SECRET set: {bool(settings.SUPABASE_JWT_SECRET)}")
