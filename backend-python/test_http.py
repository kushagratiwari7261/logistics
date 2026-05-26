import httpx
from config import settings

anon_token = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InhnaWh2d3RpYXFrcHVzcmR2Y2xrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzA2NTc3MDYsImV4cCI6MjA4NjIzMzcwNn0.ei7z2Rf-HnO8m1FoaxHyYHD_qIXYLGs9YVvAh5u8iRo"

try:
    print("Testing auth/v1/user endpoint...")
    resp = httpx.get(
        f"{settings.SUPABASE_URL}/auth/v1/user",
        headers={
            "Authorization": f"Bearer {anon_token}",
            "apikey": settings.SUPABASE_SERVICE_KEY
        }
    )
    print("Status:", resp.status_code)
    print("JSON:", resp.json())
except Exception as e:
    print("Error:", e)
