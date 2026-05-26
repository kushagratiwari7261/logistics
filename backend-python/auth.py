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
        from main import get_supabase
        supabase = get_supabase()
        
        # Verify the token directly with Supabase server instead of local decoding.
        # This handles all signature and expiry validations securely.
        user_response = supabase.auth.get_user(token)
        
        user = user_response.user
        if not user or not user.email:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid authentication token"
            )

        return {
            "id": user.id,
            "email": user.email,
            "role": user.role or "authenticated"
        }
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=f"Authentication failed: {str(e)}"
        )
