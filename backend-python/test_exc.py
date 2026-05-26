import base64
import jwt
import sys

def test_exception_string():
    anon_token = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InhnaWh2d3RpYXFrcHVzcmR2Y2xrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzA2NTc3MDYsImV4cCI6MjA4NjIzMzcwNn0.ei7z2Rf-HnO8m1FoaxHyYHD_qIXYLGs9YVvAh5u8iRo"
    secret = "e2LZ2y8mvRFXLjB//eoOcAtM1lr5lprYpuEb8uAP/PNx/sOrJPlvXlWwaTIMSQYv3yYUA9wuAieNbkZKXuwaNQ=="
    try:
        jwt.decode(anon_token, secret, algorithms=["HS256"])
    except Exception as e:
        err_msg = str(e)
        error_lower = err_msg.lower()
        print(f"Exception string: {err_msg}")
        if "expired" in error_lower:
            print("Matched EXPIRED")
        elif "alg" in error_lower or "algorithm" in error_lower:
            print("Matched ALGORITHM")
        elif "signature" in error_lower or "verification" in error_lower:
            print("Matched SIGNATURE")
        else:
            print("No match")

test_exception_string()
