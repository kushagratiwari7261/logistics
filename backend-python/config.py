import os
from pydantic_settings import BaseSettings

class Settings(BaseSettings):
    SUPABASE_URL: str
    SUPABASE_SERVICE_KEY: str
    SUPABASE_JWT_SECRET: str

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
