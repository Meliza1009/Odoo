export function Logo({ light = false, className = '' }: { light?: boolean; className?: string }) {
  return (
    <span className={`inline-flex items-center gap-2 font-bold tracking-tight ${light ? 'text-white' : 'text-primary'} ${className}`}>
      <svg viewBox="0 0 32 32" className="h-8 w-8" aria-hidden="true">
        <rect width="32" height="32" rx="8" fill={light ? '#ffffff1a' : '#14213D'} />
        <path d="M9 21a7 7 0 1 1 7 4" fill="none" stroke="#00BFA6" strokeWidth="3" strokeLinecap="round" />
        <circle cx="16" cy="25" r="2" fill="#00BFA6" />
      </svg>
      <span className="text-lg">Brightloop</span>
    </span>
  )
}
