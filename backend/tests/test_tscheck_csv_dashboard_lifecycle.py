"""CSV campaign dashboard/audit lifecycle: metrics, pause/resume/stop, and status CSV export."""

import io
import uuid


def _create_and_launch(client, suffix: str):
    inbox = client.post(
        "/workspace/inboxes/connect",
        json={"email": f"tscheck-lifecycle-{suffix}@example.com", "display_name": "tscheck lifecycle"},
    ).json()
    csv_bytes = (
        "Email,Subject,Body\n"
        f"tscheck-lifecycle-lead-{suffix}@example.com,Hello,Exact body for lifecycle test\n"
    ).encode("utf-8")
    source = client.post(
        "/csv/sources",
        files={"file": (f"tscheck-lifecycle-{suffix}.csv", io.BytesIO(csv_bytes), "text/csv")},
    ).json()
    payload = {
        "name": f"tscheck lifecycle campaign {suffix}",
        "source_id": source["id"],
        "email_column": "Email",
        "inbox_ids": [inbox["id"]],
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
    created = client.post("/csv/campaigns", json=payload)
    assert created.status_code == 200, created.text
    campaign_id = created.json()["id"]
    launched = client.post(f"/csv/campaigns/{campaign_id}/launch")
    assert launched.status_code == 200, launched.text
    return campaign_id


def test_dashboard_metrics_pause_resume_stop_and_export(client):
    suffix = uuid.uuid4().hex[:8]
    campaign_id = _create_and_launch(client, suffix)

    listing = client.get("/csv/campaigns")
    assert listing.status_code == 200, listing.text
    row = next(item for item in listing.json() if item["id"] == campaign_id)
    assert row["total_leads"] == 1
    assert row["emails_scheduled"] == 1
    assert row["emails_sent"] == 0
    assert row["failed_emails"] == 0
    assert row["skipped_leads"] == 0
    assert row["status"] == "running"

    paused = client.patch(f"/csv/campaigns/{campaign_id}/status", json={"status": "paused"})
    assert paused.status_code == 200, paused.text
    assert paused.json()["status"] == "paused"

    resumed = client.patch(f"/csv/campaigns/{campaign_id}/status", json={"status": "running"})
    assert resumed.status_code == 200, resumed.text
    assert resumed.json()["status"] == "running"

    stopped = client.patch(f"/csv/campaigns/{campaign_id}/status", json={"status": "stopped"})
    assert stopped.status_code == 200, stopped.text
    assert stopped.json()["status"] == "stopped"

    activity = client.get(f"/csv/campaigns/{campaign_id}/activity")
    assert activity.status_code == 200, activity.text
    assert all(item["status"] == "cancelled" for item in activity.json()), "stopping must cancel pending sends"

    export = client.get(f"/csv/campaigns/{campaign_id}/export")
    assert export.status_code == 200, export.text
    assert "text/csv" in export.headers.get("content-type", "")
    body_text = export.text
    assert campaign_id in body_text
    assert "Mailflow Status" in body_text
