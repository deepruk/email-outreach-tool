import pytest
from fastapi import HTTPException
from routers.rohly_campaigns import _edit_steps, _edit_remaining, _schedule_events


def test_delete_then_add_sequence_does_not_reuse_history_identity():
    old = [{"step_index": 0}, {"step_index": 2}]
    edited = _edit_steps(old, [{"step_index": 0}, {"step_index": None}], minimum_next=4)
    assert [step["step_index"] for step in edited] == [0, 4]


def test_edit_rejects_duplicate_or_foreign_step_indices():
    with pytest.raises(HTTPException):
        _edit_steps([{}], [{"step_index": 0}, {"step_index": 0}])
    with pytest.raises(HTTPException):
        _edit_steps([{}], [{"step_index": 99}])


def test_preserve_sent_failed_and_replied_history():
    rebuilt = [{"recipient_id": "a", "step_index": 0}, {"recipient_id": "a", "step_index": 4}, {"recipient_id": "b", "step_index": 0}, {"recipient_id": "c", "step_index": 0}]
    history = [{"recipient_id": "a", "step_index": 0}, {"recipient_id": "b", "step_index": 0, "replied_at": "2026-10-11"}]
    assert _edit_remaining(rebuilt, history, True) == [rebuilt[1], rebuilt[3]]


def test_deleted_first_sequence_retains_followup_key_and_schedules():
    events = _schedule_events("campaign", "Campaign", [{"id": "lead", "email": "lead@example.com"}], ["inbox"], [{"step_index": 2, "template_id": "template", "delay_days": 3}], "UTC", 1, 2, "09:00", "18:00", list(range(7)), "pattern")
    assert events[0]["step_index"] == 2
    assert events[0]["step_key"] == "step_3"
    assert events[0]["recipient_id"] == "lead"

@pytest.mark.asyncio
async def test_edit_active_campaign_is_rejected_before_any_writes(monkeypatch):
    from types import SimpleNamespace
    from routers import rohly_campaigns as module
    class Campaigns:
        async def find_one(self, scope):
            assert scope["user_id"] == "owner"
            return {"status": "active"}
        async def update_one(self, *args):
            raise AssertionError("Active campaign must not be mutated")
    monkeypatch.setattr(module, "db", SimpleNamespace(campaigns=Campaigns()))
    payload = module.CampaignEdit(name="Edited", inbox_ids=["i"], recipient_ids=["r"], steps=[{"template_id": "t"}])
    with pytest.raises(HTTPException) as error:
        await module.edit_campaign("campaign", payload, SimpleNamespace(id="owner"))
    assert error.value.status_code == 409


@pytest.mark.asyncio
async def test_missing_or_other_users_account_cannot_rebuild_campaign(monkeypatch):
    from types import SimpleNamespace
    from routers import rohly_campaigns as module
    writes = []
    class Campaigns:
        async def find_one(self, scope):
            return {"status": "paused"}
        async def update_one(self, scope, update):
            writes.append(update)
            return SimpleNamespace(modified_count=1)
    class Cursor:
        async def to_list(self, limit):
            return []
    class OwnedRows:
        def find(self, scope):
            assert scope["user_id"] == "owner"
            return Cursor()
    class History:
        async def find_one(self, scope):
            return None
        async def insert_many(self, rows):
            raise AssertionError("Invalid edit must not schedule emails")
        async def delete_many(self, scope):
            raise AssertionError("Invalid edit must not delete history")
    monkeypatch.setattr(module, "db", SimpleNamespace(campaigns=Campaigns(), inboxes=OwnedRows(), recipients=OwnedRows(), scheduled_emails=History()))
    payload = module.CampaignEdit(name="Edited", inbox_ids=["foreign"], recipient_ids=["r"], steps=[{"template_id": "t"}])
    with pytest.raises(HTTPException) as error:
        await module.edit_campaign("campaign", payload, SimpleNamespace(id="owner"))
    assert error.value.status_code == 422
    assert writes == [{"$set": {"edit_lock": True}}, {"$unset": {"edit_lock": ""}}]
