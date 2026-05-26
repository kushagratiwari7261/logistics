import logging
from fastapi import HTTPException, Security, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from jose import JWTError, jwt
from config import settings

logger = logging.getLogger(__name__)
security = HTTPBearer()


def get_current_user(credentials: HTTPAuthorizationCredentials = Security(security)) -> dict:
    """
    HTTP Bearer dependency that decodes and validates a Supabase Auth JWT token
    **locally** using the project's SUPABASE_JWT_SECRET.

    This avoids the flaky supabase.auth.get_user() round-trip which was causing
    500s that the browser then reported as CORS errors.
    """
    token = credentials.credentials

    try:
        # Decode the JWT locally using the Supabase project's JWT secret.
        # Supabase issues HS256 tokens signed with this secret.
        payload = jwt.decode(
            token,
            settings.SUPABASE_JWT_SECRET,
            algorithms=["HS256"],
            audience="authenticated",
        )
    except JWTError as e:
        logger.warning(f"JWT decode failed: {e}")
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=f"Invalid or expired authentication token: {e}",
        )

    # Extract user info from the JWT claims
    user_email = payload.get("email")
    user_id = payload.get("sub")  # Supabase stores user UUID in 'sub'
    user_role = payload.get("role", "authenticated")

    if not user_email or not user_id:
        logger.warning(f"JWT missing required claims. email={user_email}, sub={user_id}")
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Token is missing required user claims (email or sub).",
        )

    return {
        "id": user_id,
        "email": user_email,
        "role": user_role,
    }
