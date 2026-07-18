import type { ReactNode } from "react";

type IconProps = { size?: number; className?: string };

function Icon({ children, size = 22, className }: IconProps & { children: ReactNode }) {
  return (
    <svg
      aria-hidden="true"
      className={className}
      fill="none"
      height={size}
      viewBox="0 0 24 24"
      width={size}
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="1.8"
    >
      {children}
    </svg>
  );
}

export const AccountingIcons = {
  Home: (props: IconProps) => <Icon {...props}><path d="m3 11 9-8 9 8"/><path d="M5 10v10h14V10M9 20v-6h6v6"/></Icon>,
  Spark: (props: IconProps) => <Icon {...props}><path d="m12 2 1.55 5.45L19 9l-5.45 1.55L12 16l-1.55-5.45L5 9l5.45-1.55L12 2Z"/><path d="m5 15 .75 2.25L8 18l-2.25.75L5 21l-.75-2.25L2 18l2.25-.75L5 15Z"/></Icon>,
  Receipt: (props: IconProps) => <Icon {...props}><path d="M6 3h12v19l-3-2-3 2-3-2-3 2V3Z"/><path d="M9 8h6M9 12h6M9 16h3"/></Icon>,
  Settings: (props: IconProps) => <Icon {...props}><circle cx="12" cy="12" r="3"/><path d="M19 13.5v-3l-2-.7-.8-1.9.9-1.9-2.1-2.1-1.9.9-1.9-.8-.7-2h-3l-.7 2-1.9.8-1.9-.9L.9 6l.9 1.9L1 9.8l-2 .7v3l2 .7.8 1.9-.9 1.9L3 20.1l1.9-.9 1.9.8.7 2h3l.7-2 1.9-.8 1.9.9 2.1-2.1-.9-1.9.8-1.9 2-.7Z" transform="translate(2) scale(.83)"/></Icon>,
  Camera: (props: IconProps) => <Icon {...props}><path d="M4 7h4l1.5-2h5L16 7h4v12H4V7Z"/><circle cx="12" cy="13" r="3.5"/></Icon>,
  Upload: (props: IconProps) => <Icon {...props}><path d="M12 16V4m0 0L7 9m5-5 5 5"/><path d="M4 15v5h16v-5"/></Icon>,
  File: (props: IconProps) => <Icon {...props}><path d="M6 2h8l4 4v16H6V2Z"/><path d="M14 2v5h5M9 12h6M9 16h6"/></Icon>,
  Close: (props: IconProps) => <Icon {...props}><path d="m6 6 12 12M18 6 6 18"/></Icon>,
  Check: (props: IconProps) => <Icon {...props}><path d="m5 12 4 4L19 6"/></Icon>,
  Chevron: (props: IconProps) => <Icon {...props}><path d="m9 18 6-6-6-6"/></Icon>,
  ArrowLeft: (props: IconProps) => <Icon {...props}><path d="m15 18-6-6 6-6"/><path d="M9 12h11"/></Icon>,
  Edit: (props: IconProps) => <Icon {...props}><path d="m14 5 5 5M4 20l3.5-.7L19 7.8a2 2 0 0 0-2.8-2.8L4.7 16.5 4 20Z"/></Icon>,
  Trash: (props: IconProps) => <Icon {...props}><path d="M4 7h16M9 7V4h6v3M7 7l1 14h8l1-14M10 11v6M14 11v6"/></Icon>,
  Search: (props: IconProps) => <Icon {...props}><circle cx="11" cy="11" r="7"/><path d="m16 16 5 5"/></Icon>,
  Refresh: (props: IconProps) => <Icon {...props}><path d="M20 7v5h-5M4 17v-5h5"/><path d="M6.1 8A7 7 0 0 1 19 12M17.9 16A7 7 0 0 1 5 12"/></Icon>,
  Cloud: (props: IconProps) => <Icon {...props}><path d="M7 19h11a4 4 0 0 0 .3-8 6.5 6.5 0 0 0-12.4-1.7A5 5 0 0 0 7 19Z"/><path d="m9 14 2 2 4-4"/></Icon>,
  WifiOff: (props: IconProps) => <Icon {...props}><path d="m3 3 18 18M8.5 8.8a10 10 0 0 1 10.5 2.7M5 11.5a10 10 0 0 0-2 1M8 17.5a6 6 0 0 1 8 0M12 21h.01"/></Icon>,
  Shield: (props: IconProps) => <Icon {...props}><path d="M12 3 5 6v5c0 4.6 2.8 8 7 10 4.2-2 7-5.4 7-10V6l-7-3Z"/><path d="m9 12 2 2 4-4"/></Icon>,
  Logout: (props: IconProps) => <Icon {...props}><path d="M10 4H5v16h5M14 8l4 4-4 4M8 12h10"/></Icon>,
  Download: (props: IconProps) => <Icon {...props}><path d="M12 3v12m0 0 5-5m-5 5-5-5M4 20h16"/></Icon>,
  Eye: (props: IconProps) => <Icon {...props}><path d="M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6S2 12 2 12Z"/><circle cx="12" cy="12" r="2.5"/></Icon>,
  EyeOff: (props: IconProps) => <Icon {...props}><path d="m3 3 18 18M10.6 6.2c.45-.13.92-.2 1.4-.2 6.5 0 10 6 10 6a15 15 0 0 1-2.1 2.8M6.1 7.2A15 15 0 0 0 2 12s3.5 6 10 6c1.25 0 2.36-.22 3.35-.57"/><path d="M9.9 9.9a3 3 0 0 0 4.2 4.2"/></Icon>,
  Alert: (props: IconProps) => <Icon {...props}><path d="M12 3 2 21h20L12 3Z"/><path d="M12 9v5M12 18h.01"/></Icon>,
  Plus: (props: IconProps) => <Icon {...props}><path d="M12 5v14M5 12h14"/></Icon>,
  Calendar: (props: IconProps) => <Icon {...props}><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M8 3v4M16 3v4M3 10h18"/></Icon>,
  Wallet: (props: IconProps) => <Icon {...props}><path d="M4 6h15v14H4a2 2 0 0 1-2-2V6a3 3 0 0 1 3-3h12v3"/><path d="M14 11h7v5h-7a2.5 2.5 0 0 1 0-5Z"/></Icon>,
  Info: (props: IconProps) => <Icon {...props}><circle cx="12" cy="12" r="9"/><path d="M12 11v6M12 7h.01"/></Icon>,
  Mail: (props: IconProps) => <Icon {...props}><rect x="3" y="5" width="18" height="14" rx="2"/><path d="m3 7 9 6 9-6"/></Icon>,
  Clipboard: (props: IconProps) => <Icon {...props}><path d="M9 4h6v3H9V4Z"/><path d="M15 5h3a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1h3"/><path d="M9 12h6M9 16h6"/></Icon>,
  Paperclip: (props: IconProps) => <Icon {...props}><path d="m21 12-8.5 8.5a5 5 0 0 1-7-7L14 5a3.5 3.5 0 0 1 5 5l-8.5 8.5a2 2 0 0 1-3-3L16 7"/></Icon>,
};
