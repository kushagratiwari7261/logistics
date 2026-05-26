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
        # Decode the token locally using the SUPABASE_JWT_SECRET
        # This avoids network requests to the Supabase auth server and fixes communication errors.
        payload = jwt.decode(
            token,
            settings.SUPABASE_JWT_SECRET,
            algorithms=["HS256"],
            options={"verify_aud": False}
        )
        
        email = payload.get("email")
        if not email:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid authentication token"
            )

        return {
            "id": payload.get("sub"),
            "email": email,
            "role": payload.get("role", "authenticated")
        }
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=f"Authentication failed: {str(e)}"
        )
