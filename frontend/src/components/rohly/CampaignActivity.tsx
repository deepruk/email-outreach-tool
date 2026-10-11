import { useState } from "react";
import { Activity, BarChart3 } from "lucide-react";
import type { ChartPoint } from "@/lib/types";

type Props = { data?: ChartPoint[]; isLoading: boolean; isError: boolean; refreshing: boolean; updatedAt: number; onRetry: () => void };
const dateLabel = (date: string) => new Date(`${date}T12:00:00Z`).toLocaleDateString(undefined, { month: "short", day: "numeric" });

export function CampaignActivity({ data, isLoading, isError, refreshing, updatedAt, onRetry }: Props) {
  const [focused, setFocused] = useState<number | null>(null);
  const points = data ?? [];
  const selected = points[focused ?? points.length - 1];
  const max = Math.max(1, ...points.flatMap(point => [point.sends, point.replies]));
  const x = (index: number) => 12 + index / Math.max(1, points.length - 1) * 656;
  const y = (value: number) => 150 - value / max * 130;
  const line = (key: "sends" | "replies") => points.map((point, index) => `${x(index)},${y(point[key])}`).join(" ");
  const totalSent = points.reduce((total, point) => total + point.sends, 0);
  const totalReplies = points.reduce((total, point) => total + point.replies, 0);
  return <section className="cp-glass cp-activity" data-testid="campaign-activity-chart">
    <div className="cp-chart-heading"><div><span className="cp-eyebrow">PERFORMANCE PULSE</span><h2>Outreach activity</h2><p>Workspace sends and replies · Last 14 days</p></div><span className={`cp-sync ${isError ? "cp-sync-error" : ""}`}><Activity size={12} />{isError ? "Sync unavailable" : refreshing ? "Updating…" : "Auto-refresh"}</span></div>
    {isLoading && !data ? <div className="cp-chart-loading" aria-label="Loading outreach activity" aria-busy="true"><span /><span /><span /></div> : !data && isError ? <div className="cp-chart-empty" role="alert"><BarChart3 size={23} /><strong>Activity couldn’t be loaded</strong><button onClick={onRetry}>Try again</button></div> : points.length === 0 ? <div className="cp-chart-empty"><BarChart3 size={23} /><strong>No activity to chart yet</strong><p>Your sending and reply history will appear here.</p></div> : <>
      <div className="cp-chart-summary"><span><i className="cp-sent-dot" />Sent<strong>{totalSent.toLocaleString()}</strong></span><span><i className="cp-reply-dot" />Replies<strong>{totalReplies.toLocaleString()}</strong></span><div className="cp-chart-readout" aria-live="polite">{selected ? <><b>{dateLabel(selected.date)}</b><span>{selected.sends} sent · {selected.replies} replies</span></> : null}</div></div>
      <div className="cp-chart-plot"><div className="cp-y-axis"><span>{max.toLocaleString()}</span><span>{Math.round(max / 2).toLocaleString()}</span><span>0</span></div>
        <svg viewBox="0 0 680 164" preserveAspectRatio="none" role="img" aria-label="Daily email sends and replies. Focus a date to inspect its values."><defs><linearGradient id="campaignActivityFill" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#5275e8" stopOpacity=".20" /><stop offset="100%" stopColor="#5275e8" stopOpacity="0" /></linearGradient></defs>
          {[20, 85, 150].map(value => <line key={value} x1="0" x2="680" y1={value} y2={value} className="cp-gridline" strokeDasharray="3 5" />)}
          <polygon points={`12,150 ${line("sends")} ${x(points.length - 1)},150`} fill="url(#campaignActivityFill)" />
          <polyline points={line("sends")} fill="none" stroke="#5275e8" strokeWidth="2.5" vectorEffect="non-scaling-stroke" /><polyline points={line("replies")} fill="none" stroke="#159d86" strokeWidth="2.5" vectorEffect="non-scaling-stroke" />
          {points.map((point, index) => <g key={point.date}><circle cx={x(index)} cy={y(point.sends)} r={focused === index ? 4 : 2} fill="#5275e8" /><circle cx={x(index)} cy={y(point.replies)} r={focused === index ? 4 : 2} fill="#159d86" /><rect x={x(index) - 12} y="0" width="24" height="164" fill="transparent" tabIndex={0} onFocus={() => setFocused(index)} onMouseEnter={() => setFocused(index)} onBlur={() => setFocused(null)} onMouseLeave={() => setFocused(null)} aria-label={`${dateLabel(point.date)}: ${point.sends} sent, ${point.replies} replies`}><title>{`${dateLabel(point.date)}: ${point.sends} sent, ${point.replies} replies`}</title></rect></g>)}
        </svg><div className="cp-x-axis"><span>{dateLabel(points[0].date)}</span><span>{dateLabel(points[Math.floor((points.length - 1) / 2)].date)}</span><span>{dateLabel(points[points.length - 1].date)}</span></div>
      </div>
      <div className="cp-chart-footer"><span>{isError ? "Showing the last available data. Refresh to retry." : updatedAt ? `Updated ${new Date(updatedAt).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" })} · Refreshes every 30s` : "Refreshes every 30 seconds"}</span><details><summary>View data</summary><table><caption>Daily workspace outreach activity</caption><thead><tr><th>Date</th><th>Sent</th><th>Replies</th></tr></thead><tbody>{points.map(point => <tr key={point.date}><td>{dateLabel(point.date)}</td><td>{point.sends}</td><td>{point.replies}</td></tr>)}</tbody></table></details></div>
    </>}
  </section>;
}
