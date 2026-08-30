"""Unified Inbox has real Gmail reply foundations: replies list + sync endpoint."""


def test_replies_list_and_sync_are_real_endpoints(auth_client):
    resp = auth_client.get("/product/replies")
    assert resp.status_code == 200, f"{resp.status_code} {resp.text[:200]}"
    assert isinstance(resp.json(), list)  # legitimately empty workspace is fine

    # Sync calls into the real Gmail sync path; with reconnect-required inboxes it must
    # respond (not 500) rather than fabricate data.
    sync_resp = auth_client.post("/product/replies/sync")
    assert sync_resp.status_code < 500, f"sync crashed: {sync_resp.status_code} {sync_resp.text[:300]}"
