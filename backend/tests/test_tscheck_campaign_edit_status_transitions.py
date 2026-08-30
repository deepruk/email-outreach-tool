"""Editing is status-aware: draft stays draft with no premature rows, a running campaign stays
running through the edit, and a stopped campaign that gains new future work becomes paused."""

import io
import uuid


def _connect_inbox(auth_client, suffix: str):
    return auth_client.post(
        "/workspace/inboxes/connect",
        json={"email": f"tscheck-editstatus-{suffix}@example.com", "display_name": "tscheck edit status"},
    ).json()


def _upload_source(auth_client, suffix: str, tag: str):
    csv_bytes = (
        "Email,Subject,Body\n"
        f"tscheck-editstatus-{tag}-{suffix}@example.com,Hi there,Exact body\n"
    ).encode("utf-8")
    resp = auth_client.post(
        "/csv/sources",
        files={"file": (f"tscheck-editstatus-{tag}-{suffix}.csv", io.BytesIO(csv_bytes), "text/csv")},
    )
    assert resp.status_code == 200, resp.text
    return resp.json()


def _payload(name, source_id, inbox_id):
    return {
        "name": name,
        "source_id": source_id,
        "email_column": "Email",
        "inbox_ids": [inbox_id],
        "steps": [
            {"key": "initial", "label": "Initial email", "subject_column": "Subject", "body_column": "Body", "day_offset": 3, "send_time": "09:00"},
        ],
        "timezone": "UTC",
    }


def test_draft_edit_creates_no_premature_scheduled_rows(auth_client):
    suffix = uuid.uuid4().hex[:8]
    inbox = _connect_inbox(auth_client, suffix)
    source = _upload_source(auth_client, suffix, "draft")
    payload = _payload(f"tscheck draft edit campaign {suffix}", source["id"], inbox["id"])
    created = auth_client.post("/csv/campaigns", json=payload)
    assert created.status_code == 200, created.text
    campaign_id = created.json()["id"]
    assert created.json()["status"] == "draft"

    edited = {**payload, "name": f"{payload['name']} updated"}
    applied = auth_client.put(f"/csv/campaigns/{campaign_id}", json=edited)
    assert applied.status_code == 200, applied.text
    result = applied.json()
    assert result["campaign"]["status"] == "draft", "editing a draft must not launch it"

    activity = auth_client.get(f"/csv/campaigns/{campaign_id}/activity")
    assert activity.status_code == 200, activity.text
    assert activity.json() == [], "a draft edit must not create scheduled rows"


def test_running_campaign_stays_running_through_edit(auth_client):
    suffix = uuid.uuid4().hex[:8]
    inbox = _connect_inbox(auth_client, suffix)
    source = _upload_source(auth_client, suffix, "running")
    payload = _payload(f"tscheck running edit campaign {suffix}", source["id"], inbox["id"])
    created = auth_client.post("/csv/campaigns", json=payload).json()
    campaign_id = created["id"]
    launched = auth_client.post(f"/csv/campaigns/{campaign_id}/launch")
    assert launched.status_code == 200, launched.text
    assert launched.json()["campaign"]["status"] == "running"

    edited = {**payload, "steps": [{**payload["steps"][0], "day_offset": 4}]}
    applied = auth_client.put(f"/csv/campaigns/{campaign_id}", json=edited)
    assert applied.status_code == 200, applied.text
    assert applied.json()["campaign"]["status"] == "running", "a running campaign must remain running after edit"


def test_stopped_campaign_with_new_future_work_becomes_paused(auth_client):
    suffix = uuid.uuid4().hex[:8]
    inbox = _connect_inbox(auth_client, suffix)
    source = _upload_source(auth_client, suffix, "stopped")
    payload = _payload(f"tscheck stopped edit campaign {suffix}", source["id"], inbox["id"])
    created = auth_client.post("/csv/campaigns", json=payload).json()
    campaign_id = created["id"]
    launched = auth_client.post(f"/csv/campaigns/{campaign_id}/launch")
    assert launched.status_code == 200, launched.text

    stopped = auth_client.patch(f"/csv/campaigns/{campaign_id}/status", json={"status": "stopped"})
    assert stopped.status_code == 200, stopped.text
    assert stopped.json()["status"] == "stopped"

    # Edit the stopped campaign with the same future-dated step, giving it new future work to send.
    edited = {**payload, "steps": [{**payload["steps"][0], "day_offset": 6}]}
    applied = auth_client.put(f"/csv/campaigns/{campaign_id}", json=edited)
    assert applied.status_code == 200, applied.text
    assert applied.json()["campaign"]["status"] == "paused", "a stopped campaign gaining future work must become paused"

    activity = auth_client.get(f"/csv/campaigns/{campaign_id}/activity").json()
    scheduled = [item for item in activity if item["status"] == "scheduled"]
    assert len(scheduled) == 1, scheduled
