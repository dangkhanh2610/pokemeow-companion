import type { BallId } from '@/domain/types';

interface BallIconProps {
  readonly ballId: BallId;
  readonly size?: number;
  readonly className?: string;
}

export function BallIcon({ ballId, size = 24, className = '' }: BallIconProps) {
  const label = `Pokéball ${ballId}`;

  switch (ballId) {
    case 'pb':
      return (
        <svg
          width={size}
          height={size}
          viewBox="0 0 32 32"
          fill="none"
          aria-label={label}
          className={className}
        >
          <circle cx="16" cy="16" r="14" fill="#f8fafc" stroke="#1e293b" strokeWidth="2" />
          <path d="M2 16a14 14 0 0 1 28 0H2Z" fill="#ef4444" stroke="#1e293b" strokeWidth="2" />
          <line x1="2" y1="16" x2="30" y2="16" stroke="#0f172a" strokeWidth="2.5" />
          <circle cx="16" cy="16" r="4.5" fill="#f8fafc" stroke="#0f172a" strokeWidth="2" />
          <circle cx="16" cy="16" r="1.8" fill="#cbd5e1" />
        </svg>
      );

    case 'gb':
      return (
        <svg
          width={size}
          height={size}
          viewBox="0 0 32 32"
          fill="none"
          aria-label={label}
          className={className}
        >
          <circle cx="16" cy="16" r="14" fill="#f8fafc" stroke="#1e293b" strokeWidth="2" />
          <path d="M2 16a14 14 0 0 1 28 0H2Z" fill="#2563eb" stroke="#1e293b" strokeWidth="2" />
          <path d="M7.5 6.5L11.5 11.5" stroke="#ef4444" strokeWidth="3" strokeLinecap="round" />
          <path d="M24.5 6.5L20.5 11.5" stroke="#ef4444" strokeWidth="3" strokeLinecap="round" />
          <line x1="2" y1="16" x2="30" y2="16" stroke="#0f172a" strokeWidth="2.5" />
          <circle cx="16" cy="16" r="4.5" fill="#f8fafc" stroke="#0f172a" strokeWidth="2" />
        </svg>
      );

    case 'ub':
      return (
        <svg
          width={size}
          height={size}
          viewBox="0 0 32 32"
          fill="none"
          aria-label={label}
          className={className}
        >
          <circle cx="16" cy="16" r="14" fill="#f8fafc" stroke="#1e293b" strokeWidth="2" />
          <path d="M2 16a14 14 0 0 1 28 0H2Z" fill="#1e293b" stroke="#0f172a" strokeWidth="2" />
          <path
            d="M8.5 5.2V12.5H23.5V5.2"
            stroke="#facc15"
            strokeWidth="2.6"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <line x1="2" y1="16" x2="30" y2="16" stroke="#0f172a" strokeWidth="2.5" />
          <circle cx="16" cy="16" r="4.5" fill="#f8fafc" stroke="#0f172a" strokeWidth="2" />
        </svg>
      );

    case 'prb':
      return (
        <svg
          width={size}
          height={size}
          viewBox="0 0 32 32"
          fill="none"
          aria-label={label}
          className={className}
        >
          <circle cx="16" cy="16" r="14" fill="#f8fafc" stroke="#475569" strokeWidth="2" />
          <path d="M2 16a14 14 0 0 1 28 0H2Z" fill="#e2e8f0" stroke="#475569" strokeWidth="1.5" />
          <line x1="2" y1="16" x2="30" y2="16" stroke="#ef4444" strokeWidth="2.5" />
          <circle cx="16" cy="16" r="4.5" fill="#ffffff" stroke="#ef4444" strokeWidth="2" />
        </svg>
      );

    case 'mb':
      return (
        <svg
          width={size}
          height={size}
          viewBox="0 0 32 32"
          fill="none"
          aria-label={label}
          className={className}
        >
          <circle cx="16" cy="16" r="14" fill="#f8fafc" stroke="#1e293b" strokeWidth="2" />
          <path d="M2 16a14 14 0 0 1 28 0H2Z" fill="#7e22ce" stroke="#1e293b" strokeWidth="2" />
          <circle cx="8" cy="10.5" r="2.2" fill="#f472b6" />
          <circle cx="24" cy="10.5" r="2.2" fill="#f472b6" />
          <path
            d="M12.5 11.5L14 7.5L16 10L18 7.5L19.5 11.5"
            stroke="#f8fafc"
            strokeWidth="1.6"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <line x1="2" y1="16" x2="30" y2="16" stroke="#0f172a" strokeWidth="2.5" />
          <circle cx="16" cy="16" r="4.5" fill="#f8fafc" stroke="#0f172a" strokeWidth="2" />
        </svg>
      );

    case 'db':
      return (
        <svg
          width={size}
          height={size}
          viewBox="0 0 32 32"
          fill="none"
          aria-label={label}
          className={className}
        >
          <circle cx="16" cy="16" r="14" fill="#e0f2fe" stroke="#0e7490" strokeWidth="2" />
          <path d="M2 16a14 14 0 0 1 28 0H2Z" fill="#06b6d4" stroke="#0e7490" strokeWidth="2" />
          <path
            d="M7 9.5C9.5 7.5 12.5 7.5 16 9.5C19.5 11.5 22.5 11.5 25 9.5"
            stroke="#cffafe"
            strokeWidth="2"
            strokeLinecap="round"
          />
          <line x1="2" y1="16" x2="30" y2="16" stroke="#083344" strokeWidth="2.5" />
          <circle cx="16" cy="16" r="4.5" fill="#f8fafc" stroke="#083344" strokeWidth="2" />
        </svg>
      );
  }
}
