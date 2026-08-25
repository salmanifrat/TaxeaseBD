"""
TaxEaseBD - "Continue with Google" verification
----------------------------------------------------
The frontend uses Google Identity Services (accounts.google.com/gsi/client)
to get the user signed into their Google account and hands us back a
signed ID token (a JWT) - it never sees or handles a Google password.
This module's only job is to verify that token really was issued by
Google for OUR app, using google-auth's own verifier (which checks the
signature against Google's public keys, the audience, and expiry) - the
token is never trusted at face value.

Setup: create an OAuth 2.0 Client ID (type: Web application) at
https://console.cloud.google.com/apis/credentials, add your frontend
origin(s) under "Authorized JavaScript origins", then set the same
Client ID in both backend/.env (GOOGLE_CLIENT_ID) and
frontend/.env.local (NEXT_PUBLIC_GOOGLE_CLIENT_ID).
"""
import os
from typing import Optional

from google.auth.transport import requests as google_requests
from google.oauth2 import id_token

GOOGLE_CLIENT_ID = os.getenv("GOOGLE_CLIENT_ID")

_request = google_requests.Request()


def is_configured() -> bool:
    return bool(GOOGLE_CLIENT_ID)


class GoogleTokenError(Exception):
    pass


def verify_id_token(credential: str) -> dict:
    """Returns the verified token payload (dict with at least
    "email", "email_verified", "sub", and usually "name"). Raises
    GoogleTokenError on any failure - bad signature, wrong audience,
    expired token, or Google Sign-In not configured on this server."""
    if not is_configured():
        raise GoogleTokenError("Google Sign-In is not configured on this server (GOOGLE_CLIENT_ID missing)")

    try:
        payload = id_token.verify_oauth2_token(credential, _request, GOOGLE_CLIENT_ID)
    except Exception as e:
        raise GoogleTokenError(f"Invalid Google credential: {e}")

    if not payload.get("email"):
        raise GoogleTokenError("Google account has no email on file")
    if not payload.get("email_verified"):
        raise GoogleTokenError("Google email is not verified")

    return payload
