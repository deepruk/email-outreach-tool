"""Campaign editor: replacement CSV re-mapping, individual lead add/edit/remove, and impact review counts."""

import io
import uuid


def _connect_inbox(auth_client, suffix: str):
    return auth_client.post(
        "/workspace/inboxes/connect",
        json={"email": f"tscheck-editimpact-{suffix}@example.com", "display_name": "tscheck edit impact"},
    ).json()


def _upload_source(auth_client, suffix: str, rows: list[str]):
    csv_bytes = ("Email,Subject,Body\n" + "\n".join(rows)).encode("utf-8")
    resp = auth_client.post(
        "/csv/sources",
        files={"file": (f"tscheck-editimpact-{suffix}.csv", io.BytesIO(csv_bytes), "text/csv")},
    )
    assert resp.status_code == 200, resp.text
    return resp.json()


def _create_campaign(auth_client, name, source_id, inbox_id, day_offset=2, send_time="09:00", timezone="UTC"):
    payload = {
        "name": name,
        "source_id": source_id,
        "email_column": "Email",
        "inbox_ids": [inbox_id],
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
        "timezone": timezone,
    }
    created = auth_client.post("/csv/campaigns", json=payload)
    assert created.status_code == 200, created.text
    return created.json(), payload


def test_replacement_csv_requires_remapping_and_impact_reports_added_removed(auth_client):
    suffix = uuid.uuid4().hex[:8]
    inbox = _connect_inbox(auth_client, suffix)
    source = _upload_source(
        auth_client, suffix,
        [f"tscheck-alpha-{suffix}@example.com,Hi Alpha,Body alpha"],
    )
    campaign, payload = _create_campaign(auth_client, f"tscheck edit impact campaign {suffix}", source["id"], inbox["id"])
    campaign_id = campaign["id"]
    launched = auth_client.post(f"/csv/campaigns/{campaign_id}/launch")
    assert launched.status_code == 200, launched.text

    # Replace the CSV with a different header set (Full Email instead of Email) - editing with the
    # old mapping (still "Email") against the new source must fail validation (422) since that column
    # no longer exists, proving remapping is required when headers differ.
    replaced_csv = (
        "Full Email,Subject,Body\n"
        f"tscheck-beta-{suffix}@example.com,Hi Beta,Body beta\n"
    ).encode("utf-8")
    new_source = auth_client.post(
        "/csv/sources",
        files={"file": (f"tscheck-editimpact-replacement-{suffix}.csv", io.BytesIO(replaced_csv), "text/csv")},
    ).json()

    stale_mapping_payload = {**payload, "source_id": new_source["id"]}
    bad_impact = auth_client.post(f"/csv/campaigns/{campaign_id}/edit-impact", json=stale_mapping_payload)
    assert bad_impact.status_code == 422, bad_impact.text

    # Correct remapping (Full Email) succeeds and reports an added lead (beta) and a removed lead (alpha).
    remapped_payload = {**payload, "source_id": new_source["id"], "email_column": "Full Email"}
    impact = auth_client.post(f"/csv/campaigns/{campaign_id}/edit-impact", json=remapped_payload)
    assert impact.status_code == 200, impact.text
    body = impact.json()
    assert body["added"] == 1, body
    assert body["removed"] == 1, body

    applied = auth_client.put(f"/csv/campaigns/{campaign_id}", json=remapped_payload)
    assert applied.status_code == 200, applied.text
    result = applied.json()
    assert result["impact"]["added"] == 1
    assert result["impact"]["removed"] == 1

    activity = auth_client.get(f"/csv/campaigns/{campaign_id}/activity")
    assert activity.status_code == 200, activity.text
    emails = {item["recipient_email"] for item in activity.json() if item["status"] == "scheduled"}
    assert f"tscheck-beta-{suffix}@example.com" in emails
    assert f"tscheck-alpha-{suffix}@example.com" not in emails


def test_derive_source_supports_individual_lead_add_edit_remove(auth_client):
    suffix = uuid.uuid4().hex[:8]
    inbox = _connect_inbox(auth_client, suffix)
    source = _upload_source(
        auth_client, suffix,
        [
            f"tscheck-gamma-{suffix}@example.com,Hi Gamma,Body gamma",
            f"tscheck-delta-{suffix}@example.com,Hi Delta,Body delta",
        ],
    )
    campaign, payload = _create_campaign(auth_client, f"tscheck derive campaign {suffix}", source["id"], inbox["id"])
    campaign_id = campaign["id"]
    launched = auth_client.post(f"/csv/campaigns/{campaign_id}/launch")
    assert launched.status_code == 200, launched.text

    # Individual edits: keep gamma with an edited exact subject, remove delta, add epsilon.
    edited_rows = [
        {"Email": f"tscheck-gamma-{suffix}@example.com", "Subject": "Hi Gamma Edited", "Body": "Body gamma"},
        {"Email": f"tscheck-epsilon-{suffix}@example.com", "Subject": "Hi Epsilon", "Body": "Body epsilon"},
    ]
    derived = auth_client.post(f"/csv/sources/{source['id']}/derive", json={"rows": edited_rows})
    assert derived.status_code == 200, derived.text
    derived_source = derived.json()
    assert derived_source["row_count"] == 2
    assert derived_source["id"] != source["id"], "derive must create an immutable new source snapshot"

    updated_payload = {**payload, "source_id": derived_source["id"]}
    applied = auth_client.put(f"/csv/campaigns/{campaign_id}", json=updated_payload)
    assert applied.status_code == 200, applied.text

    activity = auth_client.get(f"/csv/campaigns/{campaign_id}/activity")
    assert activity.status_code == 200, activity.text
    scheduled = [item for item in activity.json() if item["status"] == "scheduled"]
    by_email = {item["recipient_email"]: item for item in scheduled}
    assert f"tscheck-gamma-{suffix}@example.com" in by_email
    assert by_email[f"tscheck-gamma-{suffix}@example.com"]["subject"] == "Hi Gamma Edited"
    assert f"tscheck-epsilon-{suffix}@example.com" in by_email
    assert f"tscheck-delta-{suffix}@example.com" not in by_email

    # Original uploaded source remains untouched (immutability of the original snapshot).
    original_after = auth_client.get(f"/csv/sources/{source['id']}")
    assert original_after.status_code == 200, original_after.text
    assert original_after.json()["rows"][0]["Subject"] == "Hi Gamma"
