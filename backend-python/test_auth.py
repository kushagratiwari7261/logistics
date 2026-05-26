import asyncio
import sys
from auth import get_current_user
from fastapi.security import HTTPAuthorizationCredentials

anon_token = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InhnaWh2d3RpYXFrcHVzcmR2Y2xrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzA2NTc3MDYsImV4cCI6MjA4NjIzMzcwNn0.ei7z2Rf-HnO8m1FoaxHyYHD_qIXYLGs9YVvAh5u8iRo"

async def test():
    credentials = HTTPAuthorizationCredentials(scheme="Bearer", credentials=anon_token)
    try:
        user = get_current_user(credentials)
        print("Success!", user)
    except Exception as e:
        print("Failed!", e)

asyncio.run(test())
