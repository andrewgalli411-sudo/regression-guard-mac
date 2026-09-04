type P = { className?: string };
const base = "h-[18px] w-[18px]";

export const CarIcon = ({ className }: P) => (
  <svg viewBox="0 0 24 24" fill="none" className={className ?? base} aria-hidden>
    <path
      d="M4 16v2.2a.8.8 0 0 1-.8.8H2.3a.8.8 0 0 1-.8-.8V12l2-5.2A2 2 0 0 1 5.4 5.5h13.2a2 2 0 0 1 1.9 1.3L22.5 12v6.2a.8.8 0 0 1-.8.8h-.9a.8.8 0 0 1-.8-.8V16"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
    <path d="M1.5 12h21" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    <circle cx="6.5" cy="14.5" r="1.2" fill="currentColor" />
    <circle cx="17.5" cy="14.5" r="1.2" fill="currentColor" />
  </svg>
);

export const GaugeIcon = ({ className }: P) => (
  <svg viewBox="0 0 24 24" fill="none" className={className ?? base} aria-hidden>
    <path
      d="M3.5 18a9.5 9.5 0 1 1 17 0"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
    />
    <path d="M12 13.5 16.5 9" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    <circle cx="12" cy="14" r="1.6" fill="currentColor" />
  </svg>
);

export const UsersIcon = ({ className }: P) => (
  <svg viewBox="0 0 24 24" fill="none" className={className ?? base} aria-hidden>
    <circle cx="9" cy="8" r="3.2" stroke="currentColor" strokeWidth="1.6" />
    <path
      d="M2.8 19.4c.5-3.1 3.1-5.2 6.2-5.2s5.7 2.1 6.2 5.2"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
    />
    <path
      d="M16.4 5.4a3.2 3.2 0 0 1 .3 6.2M17.6 14.6c2.1.5 3.7 2.3 4 4.8"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
    />
  </svg>
);

export const MapIcon = ({ className }: P) => (
  <svg viewBox="0 0 24 24" fill="none" className={className ?? base} aria-hidden>
    <path
      d="M12 21s7-6.1 7-11a7 7 0 1 0-14 0c0 4.9 7 11 7 11Z"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinejoin="round"
    />
    <circle cx="12" cy="10" r="2.4" stroke="currentColor" strokeWidth="1.6" />
  </svg>
);

export const BoltIcon = ({ className }: P) => (
  <svg viewBox="0 0 24 24" fill="none" className={className ?? base} aria-hidden>
    <path
      d="M13.2 2.5 4.8 13.4h6L10.2 21.5l8.6-11.1h-6.2l.6-7.9Z"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinejoin="round"
    />
  </svg>
);

export const ArrowIcon = ({ className }: P) => (
  <svg viewBox="0 0 24 24" fill="none" className={className ?? "h-4 w-4"} aria-hidden>
    <path
      d="M5 12h13m0 0-5-5m5 5-5 5"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);

export const AlertIcon = ({ className }: P) => (
  <svg viewBox="0 0 24 24" fill="none" className={className ?? base} aria-hidden>
    <path
      d="M12 3.8 21 19.2H3L12 3.8Z"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinejoin="round"
    />
    <path d="M12 10v4" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
    <circle cx="12" cy="16.6" r="1" fill="currentColor" />
  </svg>
);

export const WrenchIcon = ({ className }: P) => (
  <svg viewBox="0 0 24 24" fill="none" className={className ?? base} aria-hidden>
    <path
      d="M15.6 3.4a5 5 0 0 0-5.9 6.4L3.6 15.9a2 2 0 0 0 2.8 2.8l6.1-6.1a5 5 0 0 0 6.4-5.9l-2.9 2.9-2.6-.7-.7-2.6 2.9-2.9Z"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinejoin="round"
    />
  </svg>
);

export const IdleIcon = ({ className }: P) => (
  <svg viewBox="0 0 24 24" fill="none" className={className ?? base} aria-hidden>
    <circle cx="12" cy="12" r="8.4" stroke="currentColor" strokeWidth="1.6" />
    <path d="M12 7.4V12l3 1.8" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
  </svg>
);
