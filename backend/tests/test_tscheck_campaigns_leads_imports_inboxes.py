"""Campaigns/leads/imports/inboxes surfaces are backed by real data APIs (no fake rows)."""


def test_leads_paginate_and_search(auth_client):
    resp = auth_client.get("/product/leads?page=1&page_size=25&q=")
    assert resp.status_code == 200, f"{resp.status_code} {resp.text[:200]}"
    body = resp.json()
    for key in ("items", "total", "page", "page_size"):
        assert key in body
    assert body["page"] == 1
    assert body["page_size"] == 25

    # Search for a term guaranteed absent should filter down to zero, not error/crash.
    filtered = auth_client.get("/product/leads?page=1&page_size=25&q=tscheck-no-such-lead-xyz")
    assert filtered.status_code == 200
    assert filtered.json()["total"] == 0


def test_imports_and_inboxes_list_from_real_data(auth_client):
    imports_resp = auth_client.get("/csv/sources")
    assert imports_resp.status_code == 200, f"{imports_resp.status_code} {imports_resp.text[:200]}"
    assert isinstance(imports_resp.json(), list)

    inboxes_resp = auth_client.get("/workspace/inboxes")
    assert inboxes_resp.status_code == 200, f"{inboxes_resp.status_code} {inboxes_resp.text[:200]}"
    inboxes = inboxes_resp.json()
    assert isinstance(inboxes, list)
    emails = {row["email"] for row in inboxes}
    # Seed facts: the two real Gmail inboxes must remain visible.
    assert "deepanshu@rohence.com" in emails or "deepanshu@tryrohence.com" in emails, (
        f"expected seeded Gmail inboxes present, got {emails}"
    )


def test_inbox_health_and_analytics_are_server_derived(auth_client):
    health_resp = auth_client.get("/product/inbox-health")
    assert health_resp.status_code == 200, f"{health_resp.status_code} {health_resp.text[:200]}"
    rows = health_resp.json()
    assert isinstance(rows, list)
    for row in rows:
        assert "health_score" in row and "utilization" in row

    analytics_resp = auth_client.get("/product/analytics?days=30")
    assert analytics_resp.status_code == 200, f"{analytics_resp.status_code} {analytics_resp.text[:200]}"
