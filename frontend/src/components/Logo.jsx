export default function Logo({ size = 34, withWord = true, dim = false }) {
  return (
    <span className="inline-flex items-center gap-2.5 select-none" data-testid="rohly-logo">
      <svg width={size} height={size} viewBox="0 0 64 64" fill="none" aria-hidden="true">
        <rect width="64" height="64" rx="14" fill={dim ? 'transparent' : '#0D111A'} stroke="#1E293B" strokeWidth={dim ? 0 : 1.5} />
        <path d="M21 41a15.5 15.5 0 0 1 22 0" stroke="#FF5A1F" strokeWidth="5" strokeLinecap="round" />
        <path d="M14 48a25.5 25.5 0 0 1 36 0" stroke="#FF5A1F" strokeWidth="5" strokeLinecap="round" opacity=".4" />
        <circle cx="32" cy="46" r="5.5" fill="#06B6D4" />
      </svg>
      {withWord && (
        <span className="font-display font-semibold text-xl tracking-tight text-slate-50">
          Rohly
        </span>
      )}
    </span>
  );
}
