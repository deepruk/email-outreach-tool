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

@pytest.mark.asyncio
async def test_paused_edit_adds_lead_without_resending_or_deleting_history(monkeypatch):
    from datetime import datetime, timezone
    from types import SimpleNamespace
    from routers import rohly_campaigns as module
    stamp = datetime.now(timezone.utc)
    campaign = {"id":"campaign", "status":"paused", "name":"Old", "steps":[{"template_id":"t", "step_index":0}], "recipient_ids":["old"], "inbox_ids":["i"], "launched_at":stamp, "timezone":"UTC", "min_gap_minutes":1, "max_gap_minutes":2, "sending_window_start":"09:00", "sending_window_end":"18:00", "sending_days":list(range(7))}
    sent = {"id":"history", "recipient_id":"old", "step_index":0, "status":"sent", "inbox_id":"i", "sent_at":stamp, "scheduled_at":stamp}
    inserted, deleted, saved = [], [], []
    class Cursor:
        def __init__(self, rows): self.rows = rows
        async def to_list(self, limit): return self.rows
    class Campaigns:
        async def find_one(self, scope): return campaign.copy()
        async def update_one(self, scope, update):
            saved.append(update)
            return SimpleNamespace(modified_count=1)
    class Rows:
        def __init__(self, rows): self.rows = rows
        def find(self, scope):
            assert scope["user_id"] == "owner"
            return Cursor(self.rows)
    class History:
        async def find_one(self, scope): return None
        def find(self, scope):
            if scope.get("replied_at") is None and "replied_at" in scope:
                return Cursor([{"id":"old-future"}])
            return Cursor([sent])
        async def insert_many(self, rows): inserted.extend(rows)
        async def delete_many(self, scope): deleted.extend(scope["id"]["$in"])
    monkeypatch.setattr(module, "db", SimpleNamespace(campaigns=Campaigns(), inboxes=Rows([{"id":"i","daily_sending_limit":100}]), recipients=Rows([{"id":"old","email":"old@example.com"},{"id":"new","email":"new@example.com"}]), templates=Rows([{"id":"t"}]), scheduled_emails=History()))
    payload = module.CampaignEdit(name="Edited", inbox_ids=["i"], recipient_ids=["old","new"], steps=[{"template_id":"t","step_index":0}])
    result = await module.edit_campaign("campaign", payload, SimpleNamespace(id="owner"))
    assert result["status"] == "paused"
    assert result["total_count"] == 2
    assert [row["recipient_id"] for row in inserted] == ["new"]
    assert deleted == ["old-future"]
    assert inserted[0]["user_id"] == "owner"
    assert saved[-1] == {"$unset":{"edit_lock":""}}

@pytest.mark.asyncio
@pytest.mark.parametrize("initial_status, expected", [("paused", []), ("active", ["sending", "scheduled"])])
async def test_sender_keeps_paused_messages_pending(monkeypatch, initial_status, expected):
    import asyncio
    from types import SimpleNamespace
    from datetime import datetime, timezone
    from routers import rohly_campaigns as module
    writes, reads = [], []
    class Cursor:
        def sort(self, *args): return self
        async def to_list(self, limit):
            return [{"id":"pending", "campaign_id":"campaign", "scheduled_at":datetime.now(timezone.utc), "step_index":0}]
    class Emails:
        def find(self, scope): return Cursor()
        async def update_one(self, scope, change):
            writes.append(change["$set"]["status"])
            return SimpleNamespace(modified_count=1)
    class Campaigns:
        async def find_one(self, scope):
            reads.append(scope)
            return {"status": initial_status if len(reads)==1 else "paused"}
        async def distinct(self, *args): return []
    async def finish_cycle(seconds): raise asyncio.CancelledError
    monkeypatch.setattr(module, "db", SimpleNamespace(campaigns=Campaigns(), scheduled_emails=Emails()))
    monkeypatch.setattr(module.asyncio, "sleep", finish_cycle)
    with pytest.raises(asyncio.CancelledError):
        await module.process_template_campaigns()
    assert reads
    assert writes == expected
