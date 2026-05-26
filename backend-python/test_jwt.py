import base64
import jwt
from config import settings

anon_token = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InhnaWh2d3RpYXFrcHVzcmR2Y2xrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzA2NTc3MDYsImV4cCI6MjA4NjIzMzcwNn0.ei7z2Rf-HnO8m1FoaxHyYHD_qIXYLGs9YVvAh5u8iRo"
secret = settings.SUPABASE_JWT_SECRET

print("JWT version:", jwt.__version__)
print("Secret length:", len(secret))

try:
    decoded_secret = base64.b64decode(secret)
    print("Base64 decoded secret length:", len(decoded_secret))
except Exception as e:
    print("Base64 decode failed:", e)

# Test PyJWT
try:
    print("Testing PyJWT decode with raw secret:")
    payload = jwt.decode(anon_token, secret, algorithms=["HS256"], options={"verify_exp": False, "verify_aud": False})
    print("SUCCESS with raw secret:", payload)
except Exception as e:
    print("FAILED with raw secret:", repr(e))

if 'decoded_secret' in locals():
    try:
        print("Testing PyJWT decode with base64 decoded secret:")
        payload = jwt.decode(anon_token, decoded_secret, algorithms=["HS256"], options={"verify_exp": False, "verify_aud": False})
        print("SUCCESS with base64 decoded secret:", payload)
    except Exception as e:
        print("FAILED with base64 decoded secret:", repr(e))
