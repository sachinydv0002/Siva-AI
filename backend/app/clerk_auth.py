
import os
from pathlib import Path

import httpx
from dotenv import load_dotenv
from fastapi import HTTPException, Request
from clerk_backend_api import Clerk
from clerk_backend_api.security.types import AuthenticateRequestOptions

BACKEND_DIR = Path(__file__).resolve().parents[1]
load_dotenv(BACKEND_DIR / ".env")

CLERK_SECRET_KEY = os.getenv("CLERK_SECRET_KEY")
CLERK_AUTHORIZED_PARTY = os.getenv(
    "CLERK_AUTHORIZED_PARTY",
    "http://localhost:5173",
)


def get_clerk_client():
    if not CLERK_SECRET_KEY:
        raise RuntimeError(
            "CLERK_SECRET_KEY is missing from backend/.env"
        )

    return Clerk(bearer_auth=CLERK_SECRET_KEY)


def get_current_user_id(request: Request) -> str | None:
    authorization = request.headers.get("authorization")

    # Requests without a token are guest requests.
    if not authorization:
        return None

    if not authorization.lower().startswith("bearer "):
        raise HTTPException(
            status_code=401,
            detail="Invalid authorization header",
        )

    try:
        clerk_request = httpx.Request(
            method=request.method,
            url=str(request.url),
            headers=dict(request.headers),
        )

        clerk = get_clerk_client()

        auth_state = clerk.authenticate_request(
            clerk_request,
            AuthenticateRequestOptions(
                authorized_parties=[CLERK_AUTHORIZED_PARTY],
            ),
        )

        if not auth_state.is_signed_in:
            raise HTTPException(
                status_code=401,
                detail="Invalid or expired Clerk session",
            )

        payload = auth_state.payload or {}
        user_id = payload.get("sub")

        if not user_id:
            raise HTTPException(
                status_code=401,
                detail="Clerk user ID not found",
            )

        return user_id

    except HTTPException:
        raise
    except Exception as exc:
        print(f"Clerk authentication error: {exc}")
        raise HTTPException(
            status_code=401,
            detail="Unable to verify Clerk session",
        ) from exc
