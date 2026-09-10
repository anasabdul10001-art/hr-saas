export function Logo({ compact = false }: { compact?: boolean }) {
  return (
    <div className="flex items-center gap-2">
      <svg width="28" height="28" viewBox="0 0 48 48" fill="none" className="shrink-0">
        <rect width="48" height="48" rx="12" fill="#4f46e5" />
        <circle cx="24" cy="24" r="14" stroke="#ffffff" strokeWidth="3" opacity="0.35" />
        <circle cx="24" cy="24" r="7" fill="#ffffff" />
      </svg>
      {!compact && <span className="text-lg font-bold tracking-tight text-slate-900">Nawa</span>}
    </div>
  );
}
