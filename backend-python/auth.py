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
    """
    token = credentials.credentials

    # Peek at the unverified header to log which algorithm the token uses
    try:
        header = jwt.get_unverified_header(token)
        alg = header.get("alg", "HS256")
        logger.info(f"JWT header alg={alg}, typ={header.get('typ')}")
    except Exception as e:
        logger.warning(f"Could not read JWT header: {e}")
        alg = "HS256"

    try:
        # Accept all HMAC-based algorithms that Supabase might use
        payload = jwt.decode(
            token,
            settings.SUPABASE_JWT_SECRET,
            algorithms=["HS256", "HS384", "HS512"],
            options={"verify_aud": False},  # Skip audience check for flexibility
        )
    except JWTError as e:
        logger.warning(f"JWT decode failed (alg={alg}): {e}")
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=f"Invalid or expired authentication token: {e}",
        )

    # Extract user info from the JWT claims
    user_email = payload.get("email")
    user_id = payload.get("sub")  # Supabase stores user UUID in 'sub'
    user_role = payload.get("role", "authenticated")

    logger.info(f"JWT decoded OK: sub={user_id}, email={user_email}, role={user_role}")

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
