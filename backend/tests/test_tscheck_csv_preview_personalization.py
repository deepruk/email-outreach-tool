"""CSV campaign preview: exact per-lead personalization + skip of incomplete rows."""

FIXTURE_PATH = "/app/tests/fixtures/personalized-leads.csv"

STEPS = [
    {"key": "initial", "label": "Initial email", "subject_column": "First Subject", "body_column": "First Body", "day_offset": 1, "send_time": "10:30"},
    {"key": "follow_up_1", "label": "Follow-up 1", "subject_column": "Follow-up 1 Subject", "body_column": "Follow-up 1 Body", "day_offset": 4, "send_time": "11:00"},
    {"key": "follow_up_2", "label": "Follow-up 2", "subject_column": "Follow-up 2 Subject", "body_column": "Follow-up 2 Body", "day_offset": 7, "send_time": "14:00"},
]


def _upload_fixture(auth_client):
    with open(FIXTURE_PATH, "rb") as fh:
        response = auth_client.post("/csv/sources", files={"file": ("personalized-leads.csv", fh, "text/csv")})
    assert response.status_code == 200, response.text
    return response.json()


def test_preview_keeps_exact_per_lead_copy_and_skips_incomplete_row(auth_client):
    source = _upload_fixture(auth_client)
    assert source["row_count"] == 3

    payload = {
        "name": "tscheck csv preview campaign",
        "source_id": source["id"],
        "email_column": "Email",
        "first_name_column": "First Name",
        "company_column": "Company",
        "status_column": "Status",
        "inbox_ids": [],
        "steps": STEPS,
        "timezone": "Asia/Kolkata",
    }
    # preview does not require inbox_ids to be non-empty on the endpoint itself (model requires min 1),
    # but the preview endpoint only needs source/columns; supply a placeholder id which is unused by preview logic.
    payload["inbox_ids"] = ["placeholder-inbox-id"]

    response = auth_client.post("/csv/campaigns/preview", json=payload)
    assert response.status_code == 200, response.text
    body = response.json()

    assert body["valid_count"] == 2, body
    assert body["skipped_count"] == 1, body

    leads = {lead["email"]: lead for lead in body["leads"]}
    john = leads["john.csv-test@example.com"]
    sarah = leads["sarah.csv-test@example.com"]
    missing = leads["missing.csv-test@example.com"]

    assert john["error"] is None
    john_initial = next(step for step in john["steps"] if step["key"] == "initial")
    assert john_initial["subject"] == "Quick idea for ABC security"
    assert "This exact message belongs only to John." in john_initial["body"]

    assert sarah["error"] is None
    sarah_initial = next(step for step in sarah["steps"] if step["key"] == "initial")
    assert sarah_initial["subject"] == "Security compliance at XYZ"
    assert "This exact message belongs only to Sarah." in sarah_initial["body"]

    # No cross-row mixing: each lead's exact subject/body only appears under its own email.
    assert john_initial["subject"] != sarah_initial["subject"]
    assert john_initial["body"] != sarah_initial["body"]

    # The missing lead lacks a First Subject value and must be reported as an error/skip.
    assert missing["error"] is not None
    assert "subject" in missing["error"].lower()
