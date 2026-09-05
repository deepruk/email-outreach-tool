export function parseServerUtc(value: string): Date {
  const hasZone = /(?:Z|[+-]\d{2}:?\d{2})$/i.test(value);
  return new Date(hasZone ? value : `${value}Z`);
}

export function formatCampaignDateTime(value: string | null, timeZone: string): string {
  if (!value) return "—";
  return new Intl.DateTimeFormat("en-IN", {
    timeZone,
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZoneName: "short",
  }).format(parseServerUtc(value));
}

export function formatCampaignDate(value: string, timeZone: string): string {
  return new Intl.DateTimeFormat("en-IN", {
    timeZone,
    year: "numeric",
    month: "short",
    day: "numeric",
  }).format(parseServerUtc(value));
}