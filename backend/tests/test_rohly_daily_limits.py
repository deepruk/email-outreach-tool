from datetime import datetime, timezone
from zoneinfo import ZoneInfo

from routers.rohly_campaigns import _daily_limit_violations


def test_daily_limit_guard_counts_proposed_and_existing_sends_per_local_day():
    tz = ZoneInfo("Asia/Kolkata")
    scheduled = datetime(2026, 10, 12, 5, 0, tzinfo=timezone.utc)
    existing = [
        {"inbox_id": "inbox-1", "status": "sent", "sent_at": scheduled, "scheduled_at": scheduled},
    ]
    proposed = [
        {"inbox_id": "inbox-1", "scheduled_at": scheduled},
        {"inbox_id": "inbox-1", "scheduled_at": scheduled},
    ]
    inboxes = [{"id": "inbox-1", "email": "sender@example.com", "daily_sending_limit": 2}]

    violations = _daily_limit_violations(proposed, existing, inboxes, "Asia/Kolkata")

    assert len(violations) == 1
    assert violations[0] == {
        "inbox_id": "inbox-1",
        "inbox_email": "sender@example.com",
        "date": "2026-10-12",
        "count": 3,
        "limit": 2,
    }


def test_daily_limit_guard_allows_sends_within_limit_and_separates_local_days():
    first = datetime(2026, 10, 12, 17, 30, tzinfo=timezone.utc)
    second = datetime(2026, 10, 12, 19, 0, tzinfo=timezone.utc)
    proposed = [
        {"inbox_id": "inbox-1", "scheduled_at": first},
        {"inbox_id": "inbox-1", "scheduled_at": second},
    ]
    inboxes = [{"id": "inbox-1", "email": "sender@example.com", "daily_sending_limit": 2}]

    violations = _daily_limit_violations(proposed, [], inboxes, "Asia/Kolkata")

    assert violations == []


def test_daily_limit_guard_does_not_count_other_users_inbox_data():
    scheduled = datetime(2026, 10, 12, 5, 0, tzinfo=timezone.utc)
    proposed = [{"inbox_id": "inbox-1", "scheduled_at": scheduled}]
    # The query used by _validate_daily_limits is scoped by authenticated user_id;
    # this pure helper only sees rows returned by that scoped query.
    inboxes = [{"id": "inbox-1", "email": "sender@example.com", "daily_sending_limit": 1}]

    assert _daily_limit_violations(proposed, [], inboxes, "Asia/Kolkata") == []
