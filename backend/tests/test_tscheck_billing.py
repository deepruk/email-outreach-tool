"""Billing staging criteria: safe live PayPal status + exact approved catalog.

Covers:
- /api/billing/status is auth-protected, reports mode=live and credentials_configured=true,
  but never leaks the PayPal client secret and reports the pending (unconfigured) product/
  plan/webhook state honestly, with checkout_enabled=false.
- /api/billing/plans returns the exact approved Rohly catalog (Starter/Growth/Scale/Agency)
  with the approved monthly and annual USD amounts.
"""

CLIENT_SECRET = "EMcre-4w1VGzXwptfetbHuM_y8To7iybMY-WjKKzJ_RVjq3wRYFG4cSaHyZCGGxHH83OwIXX5vM0ezqI"

EXPECTED_PLANS = {
    "starter": (39.0, 374.40),
    "growth": (79.0, 758.40),
    "scale": (149.0, 1430.40),
    "agency": (299.0, 2870.40),
}


def test_billing_status_requires_auth(client):
    resp = client.get("/billing/status")
    assert resp.status_code == 401


def test_billing_status_is_safe_and_pending(auth_client):
    resp = auth_client.get("/billing/status")
    assert resp.status_code == 200
    body = resp.json()

    raw = resp.text
    assert "client_secret" not in raw.lower()
    assert CLIENT_SECRET not in raw

    assert body["mode"] == "live"
    assert body["credentials_configured"] is True
    assert body["product_id_configured"] is False
    assert body["configured_plan_ids"] == 0
    assert body["webhook_configured"] is False
    assert body["checkout_enabled"] is False


def test_billing_plans_match_approved_catalog(auth_client):
    resp = auth_client.get("/billing/plans")
    assert resp.status_code == 200
    plans = {p["key"]: p for p in resp.json()}

    assert set(EXPECTED_PLANS.keys()).issubset(plans.keys())
    for key, (monthly, annual) in EXPECTED_PLANS.items():
        plan = plans[key]
        assert plan["monthly_price"] == monthly, f"{key} monthly price mismatch"
        assert plan["annual_price"] == annual, f"{key} annual price mismatch"
        assert plan["monthly_plan_id_configured"] is False
        assert plan["annual_plan_id_configured"] is False

    raw = resp.text
    assert CLIENT_SECRET not in raw
