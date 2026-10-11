"""Pre-scaffolded pytest fixtures for the FastAPI backend.

Tests hit the live uvicorn process managed by supervisor (not an in-process ASGI app), so
the app under test is the same one the frontend and Playwright see. Do NOT re-create this
file — add app-specific fixtures below the marker at the bottom.
"""

import os

import httpx
import pytest
import pytest_asyncio

BACKEND_URL = os.environ.get("BACKEND_URL", "http://localhost:8001")
API_URL = f"{BACKEND_URL}/api"


def api_url(path: str = "") -> str:
    """Absolute URL for an /api route: api_url("/status") -> http://localhost:8001/api/status."""
    return f"{API_URL}{path}"


@pytest.fixture(scope="session")
def backend_url() -> str:
    return BACKEND_URL


@pytest.fixture
def client():
    """Sync httpx client rooted at /api — the default for endpoint tests.

    Example:
        def test_status(client):
            assert client.get("/status").status_code == 200
    """
    with httpx.Client(base_url=API_URL, timeout=30.0) as c:
        yield c


@pytest_asyncio.fixture
async def aclient():
    """Async variant, for tests that also await motor/backend helpers directly."""
    async with httpx.AsyncClient(base_url=API_URL, timeout=30.0) as c:
        yield c


# --- app-specific fixtures below this line ---

OWNER_EMAIL = os.environ.get("OWNER_EMAIL", "deepanshu@rohence.com")
OWNER_PASSWORD = os.environ.get("OWNER_PASSWORD", "Rohence@2026@")


@pytest.fixture
def auth_client():
    """httpx client logged in as the owner, with the session cookie forwarded explicitly.

    The rohly_session cookie is issued with Secure set (APP_URL is https), which httpx's
    cookie jar honours and therefore won't replay over this plain-http test connection —
    so the cookie is attached to every request via a client-level cookie jar built from the
    login response instead of relying on jar auto-persistence.
    """
    with httpx.Client(base_url=API_URL, timeout=30.0) as c:
        resp = c.post("/auth/login", json={"email": OWNER_EMAIL, "password": OWNER_PASSWORD})
        resp.raise_for_status()
        token = resp.cookies.get("rohly_session")
        assert token, "login did not return rohly_session cookie"
        c.cookies.set("rohly_session", token)
        c.headers["Cookie"] = f"rohly_session={token}"
        yield c
