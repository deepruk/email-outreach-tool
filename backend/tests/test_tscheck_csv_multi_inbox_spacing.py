"""CSV campaigns route across multiple connected inboxes and space repeat sends 10-20 minutes apart."""

import io
import uuid
from datetime import datetime, timezone

CSV_HEADER = "Email,First Subject,First Body\n"


def _make_csv_bytes(suffix: str, rows: int) -> bytes:
    lines = [CSV_HEADER]
    for index in range(rows):
        lines.append(f"tscheck-spacing-{suffix}-{index}@example.com,Subject {index},Body {index}\n")
    return "".join(lines).encode("utf-8")


def test_launch_distributes_leads_across_inboxes_with_spaced_repeat_sends(client):
    suffix = uuid.uuid4().hex[:8]

    inbox_a = client.post(
        "/workspace/inboxes/connect",
        json={"email": f"tscheck-spacing-a-{suffix}@example.com", "display_name": "tscheck spacing A"},
    ).json()
    inbox_b = client.post(
        "/workspace/inboxes/connect",
        json={"email": f"tscheck-spacing-b-{suffix}@example.com", "display_name": "tscheck spacing B"},
    ).json()

    csv_bytes = _make_csv_bytes(suffix, rows=4)
    source = client.post(
        "/csv/sources",
        files={"file": (f"tscheck-spacing-{suffix}.csv", io.BytesIO(csv_bytes), "text/csv")},
    ).json()

    payload = {
        "name": f"tscheck spacing campaign {suffix}",
        "source_id": source["id"],
        "email_column": "Email",
        "inbox_ids": [inbox_a["id"], inbox_b["id"]],
        "steps": [
            {
                "key": "initial",
                "label": "Initial email",
                "subject_column": "First Subject",
                "body_column": "First Body",
                "day_offset": 1,  # scheduled a day ahead: never dispatched during this test run
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
    launch_body = launched.json()
    assert launch_body["scheduled_count"] == 4, launch_body

    activity = client.get(f"/csv/campaigns/{campaign_id}/activity")
    assert activity.status_code == 200, activity.text
    items = activity.json()
    assert len(items) == 4

    used_inboxes = {item["inbox_id"] for item in items}
    assert used_inboxes == {inbox_a["id"], inbox_b["id"]}, "leads must be distributed across both selected inboxes"

    # Group by inbox and step, then verify consecutive scheduled_at slots are 10-20 minutes apart.
    by_inbox: dict[str, list[datetime]] = {}
    for item in items:
        at = datetime.fromisoformat(item["scheduled_at"].replace("Z", "+00:00"))
        if at.tzinfo is None:
            at = at.replace(tzinfo=timezone.utc)
        by_inbox.setdefault(item["inbox_id"], []).append(at)

    for inbox_id, times in by_inbox.items():
        times.sort()
        assert len(times) == 2, f"expected round-robin to give inbox {inbox_id} exactly 2 of the 4 leads"
        gap_minutes = (times[1] - times[0]).total_seconds() / 60
        assert 10 <= gap_minutes <= 20, f"expected a 10-20 minute gap for repeat sends on inbox {inbox_id}, got {gap_minutes}"
