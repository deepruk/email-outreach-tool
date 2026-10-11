"""Dashboard is a real outbound command center backed by /api/product/dashboard."""


def test_dashboard_returns_kpis_chart_and_campaigns(auth_client):
    resp = auth_client.get("/product/dashboard")
    assert resp.status_code == 200, f"{resp.status_code} {resp.text[:200]}"
    body = resp.json()

    for key in ("emails_sent", "replies", "positive_replies", "active_campaigns"):
        metric = body.get(key)
        assert metric and "value" in metric, f"missing KPI metric {key}: {body}"

    assert isinstance(body.get("scheduled"), int)
    assert isinstance(body.get("failed"), int)
    assert isinstance(body.get("inboxes_needing_attention"), int)

    chart = body.get("chart")
    assert isinstance(chart, list) and len(chart) == 14, f"expected 14-day chart, got {chart}"

    assert isinstance(body.get("campaigns"), list)
