import asyncio
import json
import urllib.request
from datetime import datetime, timezone

from lib.db import db


async def emit_campaign_event(campaign: dict, event: str, payload: dict) -> None:
    """Persist a campaign event and optionally deliver it to the campaign webhook."""
    now = datetime.now(timezone.utc)
    record = {
        "campaign_id": campaign.get("id"),
        "user_id": campaign.get("user_id"),
        "workspace_id": campaign.get("workspace_id"),
        "event": event,
        "payload": payload,
        "created_at": now,
    }
    await db.campaign_events.insert_one(record)
    url = (campaign.get("webhook_url") or "").strip()
    enabled = set(campaign.get("webhook_events") or [])
    if not url or (enabled and event not in enabled):
        return

    body = json.dumps({
        "event": event,
        "campaign_id": campaign.get("id"),
        "campaign_name": campaign.get("name"),
        "occurred_at": now.isoformat(),
        "data": payload,
    }, default=str).encode("utf-8")

    def deliver() -> None:
        request = urllib.request.Request(
            url,
            data=body,
            headers={"Content-Type": "application/json", "User-Agent": "Rohly-Webhooks/1.0"},
            method="POST",
        )
        try:
            with urllib.request.urlopen(request, timeout=8) as response:
                response.read(1)
        except Exception:
            pass

    await asyncio.to_thread(deliver)
