import { useState } from "react";
import { Search } from "lucide-react";
import { StatusBadge } from "@/components/rohly/StatusBadge";
import { formatCampaignDateTime, parseServerUtc } from "@/lib/dates";
import type { ScheduledEmail } from "@/lib/types";

export function CampaignLeads({ events, leadEmails, timezone }: { events: ScheduledEmail[]; leadEmails: string[]; timezone: string }) {
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("All leads");
  const leads = leadEmails.map(email => {
    const rows = events.filter(item => item.recipient_email === email);
    const sentRows = rows.filter(item => item.sent_at);
    const last = [...(sentRows.length ? sentRows : rows)].sort((a,b) => parseServerUtc(b.sent_at || b.scheduled_at).getTime() - parseServerUtc(a.sent_at || a.scheduled_at).getTime())[0];
    const next = rows.filter(item => item.status === "scheduled").sort((a,b) => parseServerUtc(a.scheduled_at).getTime() - parseServerUtc(b.scheduled_at).getTime())[0];
    const replied = rows.some(item => item.replied_at);
    const failed = rows.some(item => item.status === "failed");
    const status = rows.some(item => item.bounced_at) ? "bounced" : replied ? "replied" : last?.status || "scheduled";
    return { email, rows, last, next, replied, failed, status, sent: rows.filter(item => item.status === "sent").length };
  });
  const visible = leads.filter(lead => (filter === "All leads" || filter === "Replied" && lead.replied || filter === "Failed" && lead.failed || filter === "Scheduled" && Boolean(lead.next)) && `${lead.email} ${lead.last?.first_name} ${lead.last?.company}`.toLowerCase().includes(search.toLowerCase()));
  return <section className="ref-leads" data-testid="campaign-leads-list"><div className="ref-lead-toolbar"><div className="ref-filter-buttons">{["All leads","Replied","Failed","Scheduled"].map(label => <button key={label} aria-pressed={filter === label} onClick={() => setFilter(label)} className={filter === label ? "active" : ""}>{label} <span>({leads.filter(lead => label === "All leads" || label === "Replied" && lead.replied || label === "Failed" && lead.failed || label === "Scheduled" && Boolean(lead.next)).length})</span></button>)}</div><label className="ref-lead-search"><Search size={13}/><input value={search} onChange={event => setSearch(event.target.value)} placeholder="Search leads by name, email, or company…" aria-label="Search campaign leads" /></label></div><div className="ref-table-scroll"><table><thead><tr><th>Lead info</th><th>Last message</th><th>Activity</th><th>Sequence progress</th><th>Next step</th><th>Status</th></tr></thead><tbody>{visible.map(lead => <tr key={lead.email}><td><div className="ref-lead-identity"><span>{(lead.last?.first_name || lead.email).slice(0,2).toUpperCase()}</span><div><strong>{lead.last?.first_name || lead.email}</strong><small>{lead.email}</small></div></div></td><td><strong className="ref-message-snippet">{lead.last?.subject || "—"}</strong><small>{lead.last?.company || "—"}</small></td><td><span>{lead.sent} sent · {lead.rows.reduce((sum,item) => sum + (item.open_count ?? 0),0)} opens</span><small>{lead.last ? formatCampaignDateTime(lead.last.sent_at || lead.last.scheduled_at, timezone) : "—"}</small></td><td><div className="ref-lead-progress"><i style={{width: `${lead.rows.length ? lead.sent / lead.rows.length * 100 : 0}%`}} /></div><small>{lead.sent} of {lead.rows.length} messages sent</small></td><td><span>{lead.next?.step_label || "None scheduled"}</span><small>{lead.next ? formatCampaignDateTime(lead.next.scheduled_at,timezone) : "—"}</small></td><td><StatusBadge status={lead.status}/></td></tr>)}</tbody></table>{!visible.length ? <p className="ref-empty">No leads match this view.</p> : null}</div></section>;
}
