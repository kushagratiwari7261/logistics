from fastapi import HTTPException, Security, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from jose import JWTError, jwt
from config import settings

security = HTTPBearer()

def get_current_user(credentials: HTTPAuthorizationCredentials = Security(security)) -> dict:
    """
    HTTP Bearer dependency that decodes and validates a Supabase Auth JWT token
    locally using the project's SUPABASE_JWT_SECRET.
    """
    token = credentials.credentials
    try:
        # Supabase signed JWT validation using HS256
        payload = jwt.decode(
            token,
            settings.SUPABASE_JWT_SECRET,
            algorithms=["HS256"],
            options={"verify_aud": False}  # Supabase aud parameter is usually 'authenticated'
        )
        user_id: str = payload.get("sub")
        email: str = payload.get("email")

        if not user_id or not email:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid authentication token: missing user ID or email"
            )

        return {
            "id": user_id,
            "email": email,
            "role": payload.get("role", "authenticated")
        }
    except JWTError as e:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=f"Authentication failed: {str(e)}"
        )
