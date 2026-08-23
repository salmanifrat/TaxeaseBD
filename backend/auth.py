"""
TaxEaseBD - Auth helpers
------------------------
Password hashing uses PBKDF2-HMAC-SHA256 from Python's standard library
(hashlib) instead of bcrypt/argon2, on purpose: it needs no compiled C
extension, so `pip install` never fails on a machine without build tools -
important since this project has to install cleanly on both Mac and Windows.

Session tokens are real signed JWTs (PyJWT), not the placeholder
f"token_{id}" string the app used to hand out.
"""
import hashlib
import hmac
import os
import secrets
from datetime import datetime, timedelta, timezone
from typing import Optional

import jwt

PBKDF2_ITERATIONS = 260_000

JWT_SECRET = os.getenv("JWT_SECRET", "dev-only-insecure-secret-change-me-in-.env")
JWT_ALGORITHM = "HS256"
JWT_EXPIRES_HOURS = 24 * 7  # 1 week


def hash_password(password: str) -> str:
    """Return a salted PBKDF2 hash string: pbkdf2_sha256$iterations$salt$hash"""
    salt = secrets.token_hex(16)
    digest = hashlib.pbkdf2_hmac(
        "sha256", password.encode("utf-8"), bytes.fromhex(salt), PBKDF2_ITERATIONS
    )
    return f"pbkdf2_sha256${PBKDF2_ITERATIONS}${salt}${digest.hex()}"


def verify_password(password: str, stored_hash: str) -> bool:
    """Constant-time verification against a hash produced by hash_password()."""
    try:
        algo, iterations_str, salt, digest_hex = stored_hash.split("$")
        if algo != "pbkdf2_sha256":
            return False
        iterations = int(iterations_str)
    except (ValueError, AttributeError):
        return False

    check = hashlib.pbkdf2_hmac(
        "sha256", password.encode("utf-8"), bytes.fromhex(salt), iterations
    )
    return hmac.compare_digest(check.hex(), digest_hex)


def create_access_token(user_id: int) -> str:
    payload = {
        "sub": str(user_id),
        "iat": datetime.now(timezone.utc),
        "exp": datetime.now(timezone.utc) + timedelta(hours=JWT_EXPIRES_HOURS),
    }
    return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALGORITHM)


def decode_access_token(token: str) -> Optional[dict]:
    try:
        return jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGORITHM])
    except jwt.PyJWTError:
        return None
