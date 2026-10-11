# Rohly Smartlead-Parity Implementation Specification

## Product goal
Build a reliable, agency-ready outbound platform with a cohesive workflow from prospect import through campaign execution, replies, reporting, and integrations. Use Smartlead as a capability benchmark; do not copy its branding or proprietary UI.

## Current repository baseline
- Frontend: React 19, Vite, TypeScript, Tailwind v4, shadcn/ui, React Router, TanStack Query.
- Backend: FastAPI, MongoDB/Motor, Pydantic, Gmail OAuth/sending, CSV campaigns, template campaigns, reply sync, tracking, workspaces, billing.
- Existing UI routes include dashboard, campaigns, campaign detail/editor, leads, Master Inbox, inboxes, analytics, settings, billing, and template builder.
- Important: README is stale relative to the current code. Update it after feature work and ensure the deployed commit matches the intended branch.

## P0 — reliability and safe sending
### CSV import
- One file selection must create one import operation; never iterate over all files in the picker unless multi-select is explicitly enabled.
- Show file name, bytes, row count, header detection, first 20 rows, field mapping, and validation counts before saving.
- Detect invalid emails, blank required fields, duplicate emails within the file, and leads already imported into the workspace.
- Show progress and a terminal success/failure state; errors must include a retry action and never leave a spinner running indefinitely.
- Make import idempotent and isolate each source by workspace/user.
- E2E tests: one selected file imports only its rows; duplicate click does not duplicate records; invalid CSV gives actionable error; empty file and oversized file are handled.

### Campaign execution
- Persist each sequence step, delay, permitted sending days/hours, timezone, mailbox assignment, and per-mailbox daily limit.
- Use durable background jobs rather than an in-process-only scheduler for production.
- Give each planned send an idempotency key; retries must not send duplicate messages.
- Pause future steps on reply, unsubscribe, hard bounce, campaign pause, or mailbox authentication failure.
- Campaign lifecycle states: draft, scheduled, active, paused, completed, failed.
- Preview actual personalized content per recipient before launch. Show launch validation and blockers.
- Add campaign activity timeline and per-lead delivery status.

### Mailbox reliability
- Normalize provider errors and show connected, action-required, disconnected, and limited states.
- Test connection; show last successful send/sync and today's usage.
- Support Gmail/Google Workspace OAuth first, Microsoft 365 OAuth next, and generic SMTP/IMAP only where provider policies allow.
- Encrypt refresh tokens and credentials; never expose secrets to the browser or logs.
- Pause sending on auth failure or configurable safety thresholds.

### Compliance and safety
- Workspace and campaign suppression lists; unsubscribe endpoint and enforcement before every send.
- Track hard bounces and complaints when provider signals are available.
- Support sender identity, physical mailing address, and clear opt-out handling where required by law.
- Do not promise inbox placement or use fake warm-up signals. Warm-up must be provider-aware and explicitly opt-in.

## P1 — Smartlead-style workflow and UX
### Navigation and information architecture
- Keep a consistent app shell with workspace switcher, global search, notifications, help, profile, and responsive navigation.
- Primary navigation: Dashboard, Campaigns, Leads, Master Inbox, Email Accounts, Deliverability, Automations, Integrations, Analytics.
- Secondary navigation: Templates, Domains, API & Webhooks, Team & Workspace, Billing.
- Every page needs loading, empty, error, and success states.

### Campaign builder
- Guided steps: campaign basics → leads/import → sequence → senders & schedule → review & launch.
- Sequence editor with add/reorder step, delay, subject/body, variables, plain-text preview, and per-lead preview.
- Save draft automatically with clear saved/unsaved status.
- Validate missing mappings, empty steps, invalid mailbox, unsafe limits, and absent unsubscribe configuration before launch.
- A/B testing should be added after sequence persistence and analytics are reliable.

### Master Inbox
- Three-column layout: folders/filters, conversation list, thread/contact context.
- Filters: unread, positive, neutral, negative, out-of-office, campaign, mailbox, assigned user, date.
- Actions: reply, mark read, classify, assign, add note, pause lead, unsubscribe, open campaign.
- A reply must stop future scheduled follow-ups before the next worker claims a send.
- AI sentiment is advisory and should be correctable by the user.

### Analytics
- Separate totals from rates and always show the selected date range.
- Metrics: sent, delivered where known, hard/soft bounces, replies, positive replies, unsubscribe, meetings booked when integrated, errors.
- Distinguish measured events from estimated values; never infer opens as proof of interest.
- Drill from metric → campaign → lead/message event.
- Export filtered report to CSV.

### Design system
- Light-first, clean B2B SaaS visual language; consistent spacing, typography, borders, table density, badges, buttons, dialogs, and form labels.
- Responsive layouts and accessible keyboard/focus behavior.
- No infinite loading: use timeouts, error boundaries, retry buttons, and explicit terminal states.
- Use optimistic updates only when rollback is implemented; invalidate the correct TanStack Query keys after mutations.

## P1 — automation engine
- Store automation rules as trigger + conditions + actions.
- Initial triggers: reply received, positive reply classified, hard bounce, unsubscribe, mailbox disconnected, campaign completed, import completed.
- Initial actions: pause lead, suppress address, notify user, create task, send webhook, pause campaign.
- Log every automation run with status, inputs, result, retry count, and timestamp.
- Provide dry-run/preview and enable/disable controls before allowing complex branching.

## P1 — integrations and public API
- Gmail/Google Workspace OAuth and Microsoft 365 OAuth.
- REST API with versioned routes, pagination, rate limits, workspace-scoped API keys, audit log, and revocation.
- Signed webhooks with retries and replay protection for lead.created, campaign.started, email.sent, reply.received, lead.unsubscribed, email.bounced, campaign.completed.
- CRM priorities: HubSpot first; then Pipedrive and Salesforce.
- Automation priorities: n8n, Make, Zapier, Slack.
- Prospect data: CSV/Google Sheets first; enrichment providers through opt-in adapters.
- Calendar booking links and meeting outcome sync after CRM and reply workflows are stable.

## P2 — agency and scale features
- Workspace/client separation with strict tenant scoping on every database query.
- Team roles: owner, admin, campaign manager, analyst, read-only.
- Audit log for login, mailbox connection, exports, campaign launches, suppressions, and billing changes.
- Usage quotas, plan entitlements, billing webhooks, and transparent limits.
- Advanced features: A/B testing, AI-assisted personalization, custom fields, reusable snippets, advanced reporting, webhook delivery history, and provider-specific diagnostics.

## Data model targets
- workspaces, workspace_members, leads, lead_lists, imports, campaigns, sequence_steps, campaign_memberships, mailboxes, scheduled_sends, messages, replies, suppressions, automations, automation_runs, integrations, webhook_endpoints, webhook_deliveries, audit_events.
- Every tenant-owned document must include workspace_id and be queried with it; retain user_id where needed for ownership/audit.
- Index email by normalized address + workspace; campaign/status/scheduled_at for due jobs; reply thread/provider message IDs for dedupe; webhook delivery status + next retry time.

## Acceptance gates
1. Backend unit/integration tests pass.
2. Frontend typecheck and lint pass.
3. Playwright covers import → campaign preview → launch → reply → automatic stop.
4. A failed provider send is visible, retryable, and does not create duplicate sends.
5. Unsubscribe/suppression blocks sending even when a job was already queued.
6. All endpoints enforce authentication and workspace scoping.
7. Deployment smoke tests confirm the deployed commit and key APIs are healthy.

## Delivery strategy
Ship small, reviewable pull requests in this order:
1. CSV import correctness and campaign safety.
2. Campaign builder UX and sequence persistence.
3. Durable worker/job reliability.
4. Mailbox health and reply-triggered stop.
5. Master Inbox workflow.
6. Analytics accuracy and drilldowns.
7. Automations.
8. API/webhooks and CRM integrations.
9. Team permissions, billing entitlements, and advanced features.

Do not represent a capability as complete until its backend behavior, UI states, authorization, and tests are implemented.
