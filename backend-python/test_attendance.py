import httpx
from config import settings

resp = httpx.get(
    f"{settings.SUPABASE_URL}/rest/v1/attendance",
    headers={
        "apikey": settings.SUPABASE_SERVICE_KEY,
        "Authorization": f"Bearer {settings.SUPABASE_SERVICE_KEY}"
    }
)
print(resp.json())
