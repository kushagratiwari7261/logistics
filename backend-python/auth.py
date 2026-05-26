import base64
import logging
from typing import Optional, List
from fastapi import HTTPException, Security, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from config import settings

logger = logging.getLogger(__name__)
security = HTTPBearer()

# --------------------------------------------------------------------------
# Pre-compute both possible secret representations at import time.
# Supabase JWT secrets are base64-encoded; some PyJWT versions need the
# raw bytes while others work with the original base64 string.
# --------------------------------------------------------------------------
_raw_secret: str = settings.SUPABASE_JWT_SECRET
_decoded_secret: Optional[bytes] = None

try:
    _decoded_secret = base64.b64decode(_raw_secret)
    logger.info("JWT secret successfully base64-decoded (length=%d bytes)", len(_decoded_secret))
except Exception:
    logger.info("JWT secret is not valid base64; will use as-is")

# Supabase tokens always use HS256
_ALGORITHMS = ["HS256"]


def _try_decode(token: str, secret, algorithms: List[str]) -> dict:
    """
    Attempt to decode a JWT with the given secret.
    Uses PyJWT exclusively (imported as 'jwt').
    """
    # Import PyJWT — guarded to ensure we get the right package
    try:
        import jwt as _jwt
        # Verify this is actually PyJWT, not python-jose's jwt shim
        if not hasattr(_jwt, "decode"):
            raise ImportError("jwt module missing decode()")
    except ImportError:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Server JWT library misconfigured.",
        )

    return _jwt.decode(
        token,
        secret,
        algorithms=algorithms,
        options={
            "verify_aud": False,        # Supabase tokens don't always have aud
            "verify_iss": False,        # Be lenient with issuer
            "require": ["sub", "exp"],  # Require subject and expiry
        },
    )


def get_current_user(credentials: HTTPAuthorizationCredentials = Security(security)) -> dict:
    """
    FastAPI dependency that decodes and validates a Supabase Auth JWT.

    Strategy:
      1. Try the raw secret string (works when Supabase signs with the base64 string itself).
      2. Try the base64-decoded bytes (works when the secret is the decoded HMAC key).
      3. If both fail, return a clear 401.
    """
    token = credentials.credentials

    if not token:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="No authentication token provided.",
        )

    # Peek at the header for diagnostics (never trust it for security)
    _log_jwt_header(token)

    payload = None
    last_error = None

    # --- Attempt 1: raw secret string ---
    try:
        payload = _try_decode(token, _raw_secret, _ALGORITHMS)
        logger.info("JWT decoded successfully with raw secret string")
    except Exception as e:
        last_error = e
        logger.debug("Raw secret decode failed: %s", e)

    # --- Attempt 2: base64-decoded secret bytes ---
    if payload is None and _decoded_secret is not None:
        try:
            payload = _try_decode(token, _decoded_secret, _ALGORITHMS)
            logger.info("JWT decoded successfully with base64-decoded secret")
        except Exception as e:
            last_error = e
            logger.debug("Base64-decoded secret decode failed: %s", e)

    # --- Attempt 3: try with broader algorithm list as last resort ---
    if payload is None:
        for alg_list in [["HS256", "HS384", "HS512"], ["RS256", "RS384", "RS512"]]:
            for secret in [_raw_secret, _decoded_secret]:
                if secret is None:
                    continue
                try:
                    payload = _try_decode(token, secret, alg_list)
                    logger.info("JWT decoded with fallback algorithms=%s", alg_list)
                    break
                except Exception as e:
                    last_error = e
            if payload is not None:
                break

    # --- All attempts exhausted ---
    if payload is None:
        error_msg = str(last_error) if last_error else "Unknown verification error"
        logger.error("All JWT decode attempts failed. Last error: %s", error_msg)

        # Classify the error for the user
        error_lower = error_msg.lower()
        if "expired" in error_lower:
            detail = "Authentication token has expired. Please sign in again."
        elif "alg" in error_lower or "algorithm" in error_lower:
            detail = "Token algorithm mismatch. Please sign out and sign in again."
        elif "signature" in error_lower or "verification" in error_lower:
            detail = "Token signature verification failed. Please sign in again."
        else:
            detail = f"Authentication failed: {error_msg}"

        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=detail,
        )

    # --- Extract user info from validated claims ---
    user_email = payload.get("email")
    user_id = payload.get("sub")
    user_role = payload.get("role", "authenticated")

    logger.info("JWT validated: sub=%s, email=%s, role=%s", user_id, user_email, user_role)

    if not user_email or not user_id:
        logger.warning("JWT missing required claims. Keys present: %s", list(payload.keys()))
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Token missing required claims (email or sub). Please sign in again.",
        )

    return {
        "id": user_id,
        "email": user_email,
        "role": user_role,
    }


def _log_jwt_header(token: str) -> None:
    """Best-effort peek at the JWT header for diagnostic logging."""
    try:
        import json
        header_segment = token.split(".")[0]
        # Pad base64url to standard base64
        padded = header_segment + "=" * (-len(header_segment) % 4)
        header_bytes = base64.urlsafe_b64decode(padded)
        header = json.loads(header_bytes)
        logger.info("JWT header: %s", header)
    except Exception as e:
        logger.debug("Could not inspect JWT header: %s", e)
