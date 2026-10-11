"""Test-send against mocked/paused/disconnected/missing inboxes must produce explicit
per-inbox failures (never simulated success), while still reporting partial success
correctly per inbox.
"""

import io
import uuid


CSV_HEADER = "Email,Subject,Body\n"


def _make_csv_bytes(suffix: str) -> bytes:
    return (CSV_HEADER + f"tscheck-testsend-{suffix}@example.com,Hi,Hello there\n").encode("utf-8")


def _create_campaign(auth_client, suffix: str, inbox_ids: list[str]) -> str:
    csv_bytes = _make_csv_bytes(suffix)
    source = auth_client.post(
        "/csv/sources",
        files={"file": (f"tscheck-testsend-{suffix}.csv", io.BytesIO(csv_bytes), "text/csv")},
    ).json()
    payload = {
        "name": f"tscheck test-send campaign {suffix}",
        "source_id": source["id"],
        "email_column": "Email",
        "inbox_ids": inbox_ids,
        "steps": [
            {
                "key": "initial",
                "label": "Initial email",
                "subject_column": "Subject",
                "body_column": "Body",
                "day_offset": 1,
                "send_time": "09:00",
            }
        ],
        "timezone": "UTC",
    }
    created = auth_client.post("/csv/campaigns", json=payload)
    assert created.status_code == 200, created.text
    return created.json()["id"]


def test_mocked_and_disconnected_inboxes_produce_explicit_failures_not_simulated_success(auth_client):
    suffix = uuid.uuid4().hex[:10]

    mocked_inbox = auth_client.post(
        "/workspace/inboxes/connect",
        json={"email": f"tscheck-testsend-mocked-{suffix}@example.com", "display_name": "tscheck mocked"},
    ).json()
    disconnected_inbox = auth_client.post(
        "/workspace/inboxes/connect",
        json={"email": f"tscheck-testsend-disc-{suffix}@example.com", "display_name": "tscheck disconnected"},
    ).json()

    campaign_id = _create_campaign(auth_client, suffix, [mocked_inbox["id"], disconnected_inbox["id"]])

    # Pause one inbox only after the campaign already references it, so the campaign
    # captures the moment it went unavailable rather than being blocked at creation time.
    paused = auth_client.patch(
        f"/workspace/inboxes/{disconnected_inbox['id']}",
        json={"display_name": disconnected_inbox["display_name"], "status": "paused"},
    )
    assert paused.status_code == 200, paused.text

    resp = auth_client.post(
        f"/csv/campaigns/{campaign_id}/test-send",
        json={"recipient_email": "deepanshu@rohence.com", "subject": "tscheck", "body": "tscheck body"},
    )
    assert resp.status_code == 200, resp.text
    body = resp.json()

    assert body["sent_count"] == 0, body
    assert body["failed_count"] == 2, body
    for result in body["results"]:
        assert result["success"] is False, result
        assert result.get("error"), f"expected an explicit human-readable failure reason, got {result}"
        assert result.get("message_id") is None, "a failed inbox must never carry a fabricated message id"


def test_missing_inbox_id_produces_explicit_failure(auth_client):
    suffix = uuid.uuid4().hex[:10]
    real_inbox = auth_client.post(
        "/workspace/inboxes/connect",
        json={"email": f"tscheck-testsend-real-{suffix}@example.com", "display_name": "tscheck real"},
    ).json()
    campaign_id = _create_campaign(auth_client, suffix, [real_inbox["id"]])

    # Delete the inbox after the campaign references it, then test-send should
    # report an explicit "no longer exists" failure rather than crashing or faking success.
    deleted = auth_client.delete(f"/workspace/inboxes/{real_inbox['id']}")
    assert deleted.status_code == 204, deleted.text

    resp = auth_client.post(
        f"/csv/campaigns/{campaign_id}/test-send",
        json={"recipient_email": "deepanshu@rohence.com", "subject": "tscheck", "body": "tscheck body"},
    )
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["failed_count"] == 1, body
    assert body["results"][0]["success"] is False
    assert "no longer exists" in body["results"][0]["error"].lower()
