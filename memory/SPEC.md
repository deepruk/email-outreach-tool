# Mailflow Scheduler — Living Spec

## Purpose
Mailflow Scheduler is a professional operations dashboard for sending campaign emails from multiple Gmail inboxes with a server-controlled randomized gap between each send.

## Current data model
- **Inbox**: Gmail address, display name, connection status, provider, last-used time, and whether the record is seeded MOCKED data.
- **Recipient**: name, email, and company.
- **Template**: name, subject, and body with lightweight merge-token copy.
- **Campaign**: inbox, template, recipients, queue counters, status, min/max gap, and server-anchored next-send time.
- **History**: campaign, recipient, inbox, result, and send time.

## Key flows
1. Connect a Gmail inbox through Google OAuth using the configured public callback.
2. Add recipients and templates from the dashboard.
3. Create a campaign by selecting an inbox, template, recipients, and a minimum/maximum delay.
4. Launch a campaign; the server chooses the next send time inside the configured range and sends through Gmail for OAuth-connected inboxes.
5. Review queue timing, active campaigns, activity, and send history.

The dashboard exposes dedicated navigation for inboxes, recipients, campaigns, templates, and history. Inbox connection errors return to the dashboard with a retry notice instead of a blank server error.

## Integration status
- Google OAuth and Gmail API send support are implemented in `backend/routers/scheduler.py`.
- OAuth uses a persisted PKCE verifier between the start and callback requests.
- Seeded dashboard records are intentionally **MOCKED** so the preview has a usable flow without completing Google sign-in. A seeded campaign launch records its first send as a mock event.
- No user authentication or workspace isolation exists yet; this is a single-workspace preview.