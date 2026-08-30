"""CSV campaign sequence day-offset, exact send time, and timezone are honored when scheduling."""

import io
import uuid
from datetime import datetime, timedelta
from zoneinfo import ZoneInfo


def test_launch_schedules_using_configured_day_time_and_timezone(client):
    suffix = uuid.uuid4().hex[:8]

    inbox = client.post(
        "/workspace/inboxes/connect",
        json={"email": f"tscheck-tz-{suffix}@example.com", "display_name": "tscheck timezone"},
    ).json()

    csv_bytes = (
        "Email,Subject,Body\n"
        f"tscheck-tz-lead-{suffix}@example.com,Hello there,Exact body\n"
    ).encode("utf-8")
    source = client.post(
        "/csv/sources",
        files={"file": (f"tscheck-tz-{suffix}.csv", io.BytesIO(csv_bytes), "text/csv")},
    ).json()

    day_offset = 3
    send_time = "15:45"
    tz_name = "America/New_York"
    payload = {
        "name": f"tscheck timezone campaign {suffix}",
        "source_id": source["id"],
        "email_column": "Email",
        "inbox_ids": [inbox["id"]],
        "steps": [
            {
                "key": "initial",
                "label": "Initial email",
                "subject_column": "Subject",
                "body_column": "Body",
                "day_offset": day_offset,
                "send_time": send_time,
            }
        ],
        "timezone": tz_name,
    }
    created = client.post("/csv/campaigns", json=payload)
    assert created.status_code == 200, created.text
    campaign_id = created.json()["id"]

    launched = client.post(f"/csv/campaigns/{campaign_id}/launch")
    assert launched.status_code == 200, launched.text

    activity = client.get(f"/csv/campaigns/{campaign_id}/activity")
    assert activity.status_code == 200, activity.text
    items = activity.json()
    assert len(items) == 1, items

    zone = ZoneInfo(tz_name)
    now_local = datetime.now(zone)
    hour, minute = (int(part) for part in send_time.split(":"))
    expected_local = (now_local + timedelta(days=day_offset)).replace(hour=hour, minute=minute, second=0, microsecond=0)

    scheduled_at_raw = items[0]["scheduled_at"].replace("Z", "+00:00")
    scheduled_at = datetime.fromisoformat(scheduled_at_raw)
    scheduled_local = scheduled_at.astimezone(zone)

    assert scheduled_local.date() == expected_local.date(), (scheduled_local, expected_local)
    assert scheduled_local.hour == hour, scheduled_local
    assert scheduled_local.minute == minute, scheduled_local
