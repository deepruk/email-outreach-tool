"""Rohly Template creation saves a real subject/body template via /api/workspace/templates."""

import uuid


def test_create_rohly_template_persists_and_lists(auth_client):
    unique = uuid.uuid4().hex[:8]
    name = f"tscheck-template-{unique}"
    payload = {
        "name": name,
        "subject": "Quick question for {{first_name}}",
        "body": "Hi {{first_name}}, following up about {{company}}.",
    }
    create = auth_client.post("/workspace/templates", json=payload)
    assert create.status_code == 200, f"{create.status_code} {create.text[:200]}"
    created = create.json()
    assert created["name"] == name
    assert created["subject"] == payload["subject"]
    assert created["body"] == payload["body"]

    listing = auth_client.get("/workspace/templates")
    assert listing.status_code == 200
    ids = [row["id"] for row in listing.json()]
    assert created["id"] in ids, "newly saved template did not appear in template list"
