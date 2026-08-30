import asyncio
from datetime import datetime, timedelta, timezone

from lib.db import db
from models.scheduler import Activity, Campaign, HistoryEntry, Inbox, Recipient, Template


async def seed() -> None:
    if await db.inboxes.count_documents({}) == 0:
        inboxes = [
            Inbox(email="deepanshu@northstar-studio.com", display_name="Deepanshu"),
            Inbox(email="hello@northstar-studio.com", display_name="Northstar Studio"),
        ]
        await db.inboxes.insert_many([item.model_dump() for item in inboxes])
    else:
        inboxes = [Inbox(**row) for row in await db.inboxes.find().sort("connected_at", 1).to_list(2)]

    if await db.recipients.count_documents({}) == 0:
        recipients = [
            Recipient(name="Ari Patel", email="ari@brightline.co", company="Brightline"),
            Recipient(name="Jordan Lee", email="jordan@framework.io", company="Framework"),
            Recipient(name="Sam Rivera", email="sam@civicstack.org", company="CivicStack"),
            Recipient(name="Taylor Kim", email="taylor@northpeak.dev", company="North Peak"),
            Recipient(name="Morgan Ellis", email="morgan@fieldnotes.co", company="Field Notes"),
            Recipient(name="Chris Wong", email="chris@arcstudio.co", company="Arc Studio"),
            Recipient(name="Priya Shah", email="priya@loopline.com", company="Loopline"),
            Recipient(name="Noah Williams", email="noah@coastwise.io", company="Coastwise"),
        ]
        await db.recipients.insert_many([item.model_dump() for item in recipients])
    else:
        recipients = [Recipient(**row) for row in await db.recipients.find().sort("created_at", 1).to_list(8)]

    if await db.templates.count_documents({}) == 0:
        templates = [
            Template(
                name="Warm introduction",
                subject="A quick idea for {{company}}",
                body="Hi {{first_name}},\n\nI wanted to share a short idea that may be useful for {{company}}. Would a 15-minute conversation next week be worthwhile?\n\nBest,\nDeepanshu",
            ),
            Template(
                name="Helpful follow-up",
                subject="Following up on my note",
                body="Hi {{first_name}},\n\nJust following up in case my previous note got buried. Happy to send more context if useful.\n\nBest,\nDeepanshu",
            ),
        ]
        await db.templates.insert_many([item.model_dump() for item in templates])
    else:
        templates = [Template(**row) for row in await db.templates.find().sort("created_at", 1).to_list(2)]

    if await db.campaigns.count_documents({}) == 0 and inboxes and recipients and templates:
        now = datetime.now(timezone.utc)
        campaign = Campaign(
            name="Q2 partnership outreach",
            inbox_id=inboxes[0].id,
            template_id=templates[0].id,
            recipient_ids=[item.id for item in recipients],
            total_count=len(recipients),
            sent_count=4,
            status="active",
            min_gap_minutes=10,
            max_gap_minutes=20,
            launched_at=now - timedelta(hours=1),
            next_send_at=now + timedelta(minutes=14),
        )
        await db.campaigns.insert_one(campaign.model_dump())
        for recipient in recipients[:4]:
            await db.history.insert_one(
                HistoryEntry(
                    campaign_name=campaign.name,
                    recipient_email=recipient.email,
                    inbox_email=inboxes[0].email,
                    status="sent",
                    sent_at=now - timedelta(minutes=30),
                ).model_dump()
            )
        activities = [
            Activity(message="Waiting for next send", detail="14 min remaining · Q2 partnership outreach", tone="warning"),
            Activity(message="Email sent", detail="ari@brightline.co via deepanshu@northstar-studio.com", tone="success"),
            Activity(message="Email sent", detail="jordan@framework.io via deepanshu@northstar-studio.com", tone="success"),
            Activity(message="Campaign launched", detail="Q2 partnership outreach · 8 recipients", tone="neutral"),
        ]
        await db.activities.insert_many([item.model_dump() for item in activities])


if __name__ == "__main__":
    asyncio.run(seed())