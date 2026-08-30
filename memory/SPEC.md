# Rohly — Living Spec

## Purpose
Rohly is a protected B2B outbound command center for sending personalized campaign emails from multiple Gmail inboxes with server-controlled scheduling and reply-aware follow-up cancellation.

The primary owner is Deepanshu. Email/password authentication uses a secure httpOnly session cookie; credentials are maintained in `memory/test_credentials.md`.

## Phase 1 product shell
- Fixed/collapsible sidebar with persisted state, responsive drawer, breadcrumbs, command search (`Cmd/Ctrl+K`), `N` campaign shortcut, Help, profile, and real logout.
- Real pages: Dashboard, Campaigns, campaign detail tabs, Leads, Unified Inbox, Inboxes, Inbox Health, Analytics, CSV Imports, Settings, CSV campaign source selection, and reusable Rohly Template builder.
- PayPal production credentials are secured server-side. Billing now exposes a real configuration-status page and the approved Starter/Growth/Scale/Agency monthly and annual catalog. Checkout remains disabled until one Product ID, eight Plan IDs, and a Webhook ID are supplied; no fake checkout is exposed.
- Inbox Health uses real send utilization, failures, connection state, and reply-access state. Rohly does not manufacture artificial warm-up conversations.
- Gmail OAuth requests send + read-only scopes. Connected inboxes must be reconnected once to activate reply detection.
- Reply sync matches Gmail thread IDs to sent campaign emails, records conversations, and cancels future scheduled follow-ups for the replied lead.

## Current data model
- **Inbox**: Gmail address, display name, connection status, provider, last-used time, and whether the record is seeded MOCKED data.
- **Recipient**: name, email, and company.
- **Template**: name, subject, and body with lightweight merge-token copy.
- **Campaign**: inbox, template, recipients, queue counters, status, min/max gap, and server-anchored next-send time.
- **History**: campaign, recipient, inbox, result, and send time.
- **CSV source**: immutable uploaded header/row snapshot used as the source of truth for exact per-lead copy.
- **CSV campaign**: column mapping, selected inboxes, timezone, exact sequence days/times, and delivery counters.
- **Scheduled email**: one lead row plus one sequence step, preserving its exact CSV subject/body, assigned inbox, scheduled time, result, and provider message ID.

## Key flows
1. Connect a Gmail inbox through Google OAuth using the configured public callback.
2. Add recipients and templates from the dashboard.
3. Create a campaign by selecting an inbox, template, recipients, and a minimum/maximum delay.
4. Launch a campaign; the server chooses the next send time inside the configured range and sends through Gmail for OAuth-connected inboxes.
5. Review queue timing, active campaigns, activity, and send history.

The dashboard exposes dedicated navigation for inboxes, recipients, campaigns, templates, and history. Inbox connection errors return to the dashboard with a retry notice instead of a blank server error.
Users can open Workspace settings, change browser-preview sending defaults, and delete inboxes, recipients, templates, and non-active campaigns with confirmation. Deletion is blocked when a record is still referenced by a campaign.

## CSV personalized campaign flow
1. Upload one UTF-8 CSV for the campaign.
2. Map flexible columns for recipient identity and each personalized subject/body pair.
3. Select one or more connected inboxes; Mailflow allocates round-robin within each inbox's daily limit.
4. Configure each sequence step's day offset, time, and timezone.
5. Preview actual lead rows and exact message content; incomplete rows are marked to skip.
6. Launch to create idempotent per-row scheduled messages. Messages from each inbox are spaced by a randomized 10–20 minute gap, and the background sender dispatches due messages without rewriting content.
7. Pause, resume, or stop the campaign from the Campaigns dashboard.
8. Open a campaign for lead-level timelines or download a status-enriched CSV containing campaign ID, sequence statuses, sending inboxes, and provider message IDs.

Legacy template campaigns remain visible, but all new campaigns use the CSV source-of-truth wizard.

## Integration status
- Google OAuth and Gmail API send support are implemented in `backend/routers/scheduler.py`.
- OAuth uses a persisted PKCE verifier between the start and callback requests.
- Seeded dashboard records are intentionally **MOCKED** so the preview has a usable flow without completing Google sign-in. A seeded campaign launch records its first send as a mock event.
- No user authentication or workspace isolation exists yet; this is a single-workspace preview.