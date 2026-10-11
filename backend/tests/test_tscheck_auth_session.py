"""Verifies real email/password auth: login succeeds, protected APIs reject missing
sessions, and logout destroys the session."""

import os

import httpx

BACKEND_URL = os.environ.get("BACKEND_URL", "http://localhost:8001")
API_URL = f"{BACKEND_URL}/api"

OWNER_EMAIL = os.environ.get("OWNER_EMAIL", "deepanshu@rohence.com")
OWNER_PASSWORD = os.environ.get("OWNER_PASSWORD", "Rohence@2026@")


def test_login_grants_session_and_protects_product_apis():
    with httpx.Client(base_url=API_URL, timeout=30.0) as anon:
        # Protected endpoint rejects a client with no session cookie.
        resp = anon.get("/product/dashboard")
        assert resp.status_code in (401, 403), f"expected reject, got {resp.status_code}: {resp.text[:200]}"

    with httpx.Client(base_url=API_URL, timeout=30.0) as client:
        login_resp = client.post("/auth/login", json={"email": OWNER_EMAIL, "password": OWNER_PASSWORD})
        assert login_resp.status_code == 200, f"login failed: {login_resp.status_code} {login_resp.text[:200]}"
        body = login_resp.json()
        assert body.get("email") == OWNER_EMAIL

        # The session cookie is issued with Secure set (APP_URL is https); httpx's cookie
        # jar honours that flag and won't replay it over this plain-http test connection,
        # so forward it explicitly the way a browser on the https ingress domain would.
        session_cookie = login_resp.cookies.get("rohly_session")
        assert session_cookie, "login response did not set rohly_session cookie"
        cookies = {"rohly_session": session_cookie}

        # Wrong password is rejected.
        bad = client.post("/auth/login", json={"email": OWNER_EMAIL, "password": "wrong-password"})
        assert bad.status_code == 401

        # Authenticated session can reach a protected product API.
        dash = client.get("/product/dashboard", cookies=cookies)
        assert dash.status_code == 200, f"dashboard rejected authenticated session: {dash.status_code} {dash.text[:200]}"
        assert "campaigns" in dash.json()

        # Logout destroys the session.
        logout_resp = client.post("/auth/logout", cookies=cookies)
        assert logout_resp.status_code == 204

        after_logout = client.get("/product/dashboard", cookies=cookies)
        assert after_logout.status_code in (401, 403), (
            f"dashboard still reachable after logout: {after_logout.status_code} {after_logout.text[:200]}"
        )
