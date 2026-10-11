"""Campaign test-send must succeed from every selected real Gmail inbox and never
mutate campaign state (metrics, activity counters) - user-approved real send to
deepanshu@rohence.com from the two-inbox campaign dfd0f152-dc20-433b-b40d-e14961cc1c73.
"""

REAL_CAMPAIGN_ID = "dfd0f152-dc20-433b-b40d-e14961cc1c73"
TEST_RECIPIENT = "deepanshu@rohence.com"
STATE_FIELDS = [
    "status",
    "emails_sent",
    "emails_scheduled",
    "follow_ups_scheduled",
    "failed_emails",
    "skipped_leads",
    "replies",
    "positive_replies",
]


def _find_campaign(auth_client):
    rows = auth_client.get("/csv/campaigns").json()
    for row in rows:
        if row["id"] == REAL_CAMPAIGN_ID:
            return row
    return None


def test_real_gmail_test_send_succeeds_from_both_inboxes_and_preserves_campaign_state(auth_client):
    before = _find_campaign(auth_client)
    if before is None:
        import pytest

        pytest.skip(f"seed campaign {REAL_CAMPAIGN_ID} not present in this environment")

    before_activity = auth_client.get(f"/csv/campaigns/{REAL_CAMPAIGN_ID}/activity")
    assert before_activity.status_code == 200, before_activity.text
    before_scheduled_count = sum(1 for item in before_activity.json() if item.get("status") == "scheduled")

    resp = auth_client.post(
        f"/csv/campaigns/{REAL_CAMPAIGN_ID}/test-send",
        json={
            "recipient_email": TEST_RECIPIENT,
            "subject": "Rohly test-send verification (tscheck)",
            "body": "This is an automated tscheck verification of the campaign test-send path.",
        },
    )
    assert resp.status_code == 200, resp.text
    body = resp.json()

    assert body["sent_count"] == 2, body
    assert body["failed_count"] == 0, body
    assert len(body["results"]) == 2, body

    for result in body["results"]:
        assert result["success"] is True, result
        assert result.get("message_id"), f"expected a Gmail message id, got {result}"
        assert not result.get("error"), result

    # No offset-naive/aware or invalid_scope error text should ever surface.
    raw_text = resp.text.lower()
    assert "offset-naive" not in raw_text
    assert "offset-aware" not in raw_text
    assert "invalid_scope" not in raw_text

    after = _find_campaign(auth_client)
    for field in STATE_FIELDS:
        assert after[field] == before[field], f"test-send must not mutate campaign.{field}"

    after_activity = auth_client.get(f"/csv/campaigns/{REAL_CAMPAIGN_ID}/activity")
    assert after_activity.status_code == 200, after_activity.text
    after_scheduled_count = sum(1 for item in after_activity.json() if item.get("status") == "scheduled")
    assert after_scheduled_count == before_scheduled_count, "test-send must not touch scheduled-email activity"


def test_invalid_recipient_returns_422(auth_client):
    if _find_campaign(auth_client) is None:
        import pytest

        pytest.skip(f"seed campaign {REAL_CAMPAIGN_ID} not present in this environment")

    resp = auth_client.post(
        f"/csv/campaigns/{REAL_CAMPAIGN_ID}/test-send",
        json={"recipient_email": "not-an-email", "subject": "x", "body": "y"},
    )
    assert resp.status_code == 422, resp.text
