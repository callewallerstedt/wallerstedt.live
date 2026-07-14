type IconProps = { size?: number; className?: string };

function Icon({ children, size = 22, className }: IconProps & { children: React.ReactNode }) {
  return <svg className={className} width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{children}</svg>;
}

export const Icons = {
  Drive: (p: IconProps) => <Icon {...p}><path d="M5 17h14M6.5 17l1-7h9l1 7M8 10l1.5-4h5L16 10M8 17v1.5M16 17v1.5"/><circle cx="9" cy="14" r=".7" fill="currentColor"/><circle cx="15" cy="14" r=".7" fill="currentColor"/></Icon>,
  Trips: (p: IconProps) => <Icon {...p}><path d="M5 19c3-1 3-5 6-6s3 2 6 1 2-5 2-5"/><circle cx="5" cy="19" r="2"/><circle cx="19" cy="7" r="2"/></Icon>,
  Apps: (p: IconProps) => <Icon {...p}><rect x="4" y="4" width="6" height="6" rx="1"/><rect x="14" y="4" width="6" height="6" rx="1"/><rect x="4" y="14" width="6" height="6" rx="1"/><rect x="14" y="14" width="6" height="6" rx="1"/></Icon>,
  Settings: (p: IconProps) => <Icon {...p}><circle cx="12" cy="12" r="3"/><path d="M19 13.5v-3l-2-.7-.8-1.9.9-1.9-2.1-2.1-1.9.9-1.9-.8-.7-2h-3l-.7 2-1.9.8-1.9-.9L.9 6l.9 1.9L1 9.8l-2 .7v3l2 .7.8 1.9-.9 1.9L3 20.1l1.9-.9 1.9.8.7 2h3l.7-2 1.9-.8 1.9.9 2.1-2.1-.9-1.9.8-1.9 2-.7Z" transform="translate(2) scale(.83)"/></Icon>,
  Mic: (p: IconProps) => <Icon {...p}><rect x="9" y="3" width="6" height="11" rx="3"/><path d="M6 11a6 6 0 0 0 12 0M12 17v4M9 21h6"/></Icon>,
  Battery: (p: IconProps) => <Icon {...p}><rect x="3" y="7" width="17" height="10" rx="2"/><path d="M21 10v4M6 10v4M9 10v4M12 10v4M15 10v4"/></Icon>,
  Pin: (p: IconProps) => <Icon {...p}><path d="M20 10c0 5-8 11-8 11S4 15 4 10a8 8 0 1 1 16 0Z"/><circle cx="12" cy="10" r="2.5"/></Icon>,
  Refresh: (p: IconProps) => <Icon {...p}><path d="M20 7v5h-5M4 17v-5h5M6.1 8A7 7 0 0 1 18 6l2 6M17.9 16A7 7 0 0 1 6 18l-2-6"/></Icon>,
  Close: (p: IconProps) => <Icon {...p}><path d="m6 6 12 12M18 6 6 18"/></Icon>,
  Chevron: (p: IconProps) => <Icon {...p}><path d="m9 18 6-6-6-6"/></Icon>,
  Signal: (p: IconProps) => <Icon {...p}><path d="M5 15.5a10 10 0 0 1 14 0M8 18.5a6 6 0 0 1 8 0M12 21h.01M2 12.5a14 14 0 0 1 20 0"/></Icon>,
  Thermometer: (p: IconProps) => <Icon {...p}><path d="M14 14.8V5a3 3 0 0 0-6 0v9.8a5 5 0 1 0 6 0Z"/><path d="M11 8v9"/></Icon>,
  Compass: (p: IconProps) => <Icon {...p}><circle cx="12" cy="12" r="9"/><path d="m15.5 8.5-2 5-5 2 2-5 5-2Z"/></Icon>,
  Bolt: (p: IconProps) => <Icon {...p}><path d="m13 2-8 12h7l-1 8 8-12h-7l1-8Z"/></Icon>,
  Clock: (p: IconProps) => <Icon {...p}><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></Icon>,
  WifiOff: (p: IconProps) => <Icon {...p}><path d="m3 3 18 18M8.5 8.8a10 10 0 0 1 10.5 2.7M5 11.5a10 10 0 0 0-2 1M8 17.5a6 6 0 0 1 8 0M12 21h.01"/></Icon>,
  Shield: (p: IconProps) => <Icon {...p}><path d="M12 3 5 6v5c0 4.6 2.8 8 7 10 4.2-2 7-5.4 7-10V6l-7-3Z"/><path d="m9 12 2 2 4-4"/></Icon>,
  Eye: (p: IconProps) => <Icon {...p}><path d="M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6S2 12 2 12Z"/><circle cx="12" cy="12" r="2.5"/></Icon>,
  Spark: (p: IconProps) => <Icon {...p}><path d="m12 3 1.5 4.5L18 9l-4.5 1.5L12 15l-1.5-4.5L6 9l4.5-1.5L12 3ZM5 15l.8 2.2L8 18l-2.2.8L5 21l-.8-2.2L2 18l2.2-.8L5 15Z"/></Icon>,
};
