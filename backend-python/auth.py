import logging
import httpx
from fastapi import HTTPException, Security, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from config import settings

logger = logging.getLogger(__name__)
security = HTTPBearer()

def get_current_user(credentials: HTTPAuthorizationCredentials = Security(security)) -> dict:
    """
    FastAPI dependency that validates a Supabase Auth JWT by sending it directly
    to the Supabase Auth API via a raw HTTP request. This completely bypasses local
    JWT decoding issues, algorithm mismatches, secret key encoding bugs, and
    supabase-python proxy initialization bugs.
    """
    token = credentials.credentials

    if not token:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="No authentication token provided.",
        )

    try:
        # Use the known good anon key to validate the token against the correct Supabase instance
        # This prevents 401 'Invalid API Key' errors if Railway has a stale SERVICE_KEY env var
        public_anon_key = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InhnaWh2d3RpYXFrcHVzcmR2Y2xrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzA2NTc3MDYsImV4cCI6MjA4NjIzMzcwNn0.ei7z2Rf-HnO8m1FoaxHyYHD_qIXYLGs9YVvAh5u8iRo"
        
        # Call the Supabase Auth API directly to verify the token
        response = httpx.get(
            f"{settings.SUPABASE_URL}/auth/v1/user",
            headers={
                "Authorization": f"Bearer {token}",
                "apikey": public_anon_key
            },
            timeout=10.0
        )
        
        # Unauthorized statuses
        if response.status_code in (401, 403):
            err_data = response.json()
            err_msg = err_data.get("msg", "").lower()
            
            if "expired" in err_msg:
                detail = "Authentication token has expired. Please sign in again."
            else:
                detail = "Invalid authentication token. Please sign out and sign in again."
                
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail=detail)
            
        elif response.status_code != 200:
            logger.error(f"Supabase Auth API returned {response.status_code}: {response.text}")
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="Authentication service unavailable. Please try again later.",
            )
            
        user_data = response.json()
        
        user_id = user_data.get("id")
        user_email = user_data.get("email")
        
        app_metadata = user_data.get("app_metadata", {})
        user_role = app_metadata.get("role", "authenticated")

        logger.info(f"Supabase Auth HTTP validated: sub={user_id}, email={user_email}, role={user_role}")

        if not user_email or not user_id:
            logger.warning(f"Response missing user info: {user_data}")
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Token missing required user information. Please sign in again.",
            )

        return {
            "id": user_id,
            "email": user_email,
            "role": user_role,
        }
        
    except httpx.RequestError as e:
        logger.error(f"Network error calling Supabase Auth API: {e}")
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Could not reach authentication server. Please check your connection.",
        )
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Unexpected error validating auth token: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Unexpected error during authentication verification.",
        )
