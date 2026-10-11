"""Editing a live campaign preserves protected (sent/failed) delivery history untouched with no
duplicate step created, while future unsent emails are rebuilt from the new configuration."""

import io
import time
import uuid


def _connect_inbox(auth_client, suffix: str):
    return auth_client.post(
        "/workspace/inboxes/connect",
        json={"email": f"tscheck-edithist-{suffix}@example.com", "display_name": "tscheck edit history"},
    ).json()


def _wait_for_status(auth_client, campaign_id, step_key, target_status, timeout=110):
    deadline = time.time() + timeout
    last = None
    while time.time() < deadline:
        activity = auth_client.get(f"/csv/campaigns/{campaign_id}/activity")
        assert activity.status_code == 200, activity.text
        rows = [item for item in activity.json() if item["step_key"] == step_key]
        last = rows
        if rows and all(item["status"] == target_status for item in rows):
            return rows
        time.sleep(2)
    raise AssertionError(f"step {step_key} never reached status {target_status}: {last}")


def test_edit_preserves_protected_history_and_rebuilds_only_future(auth_client):
    suffix = uuid.uuid4().hex[:8]
    inbox = _connect_inbox(auth_client, suffix)
    csv_bytes = (
        "Email,Subject,Body,FollowSubject,FollowBody\n"
        f"tscheck-edithist-lead-{suffix}@example.com,Initial subject,Initial body,Follow subject,Follow body\n"
    ).encode("utf-8")
    source = auth_client.post(
        "/csv/sources",
        files={"file": (f"tscheck-edithist-{suffix}.csv", io.BytesIO(csv_bytes), "text/csv")},
    ).json()

    payload = {
        "name": f"tscheck edit history campaign {suffix}",
        "source_id": source["id"],
        "email_column": "Email",
        "inbox_ids": [inbox["id"]],
        "steps": [
            {"key": "initial", "label": "Initial email", "subject_column": "Subject", "body_column": "Body", "day_offset": 0, "send_time": "00:00"},
            {"key": "follow_up_1", "label": "Follow-up 1", "subject_column": "FollowSubject", "body_column": "FollowBody", "day_offset": 5, "send_time": "09:00"},
        ],
        "timezone": "UTC",
    }
    created = auth_client.post("/csv/campaigns", json=payload)
    assert created.status_code == 200, created.text
    campaign_id = created.json()["id"]
    launched = auth_client.post(f"/csv/campaigns/{campaign_id}/launch")
    assert launched.status_code == 200, launched.text

    # The immediate (day_offset=0) step is sent through a mocked inbox, so the background sender
    # marks it "failed" (protected history) within a couple of scheduler ticks.
    protected_rows = _wait_for_status(auth_client, campaign_id, "initial", "failed")
    protected_id = protected_rows[0]["id"]
    protected_subject = protected_rows[0]["subject"]

    # Edit: change the future follow-up's day offset/time and body content only.
    edited_payload = {**payload}
    edited_payload["steps"] = [
        payload["steps"][0],
        {**payload["steps"][1], "day_offset": 8, "send_time": "14:30"},
    ]
    impact = auth_client.post(f"/csv/campaigns/{campaign_id}/edit-impact", json=edited_payload)
    assert impact.status_code == 200, impact.text
    impact_body = impact.json()
    assert impact_body["protected"] == 1, impact_body
    assert impact_body["rescheduled"] == 1, impact_body

    applied = auth_client.put(f"/csv/campaigns/{campaign_id}", json=edited_payload)
    assert applied.status_code == 200, applied.text

    activity = auth_client.get(f"/csv/campaigns/{campaign_id}/activity").json()
    initial_rows = [item for item in activity if item["step_key"] == "initial"]
    assert len(initial_rows) == 1, "editing must not duplicate the protected recipient+step record"
    assert initial_rows[0]["id"] == protected_id
    assert initial_rows[0]["status"] == "failed"
    assert initial_rows[0]["subject"] == protected_subject

    follow_up_rows = [item for item in activity if item["step_key"] == "follow_up_1"]
    assert len(follow_up_rows) == 1
    assert follow_up_rows[0]["status"] == "scheduled"
    scheduled_at = follow_up_rows[0]["scheduled_at"].replace("Z", "+00:00")
    from datetime import datetime
    parsed = datetime.fromisoformat(scheduled_at)
    assert parsed.hour == 14 and parsed.minute == 30, parsed  # UTC timezone campaign -> exact rebuilt time
