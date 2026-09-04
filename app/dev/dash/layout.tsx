import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";

import "@/app/bolag/os.css";

export const metadata: Metadata = {
  title: "Dash mock | Bolag",
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#161616",
};

export default function DashMockLayout({ children }: { children: ReactNode }) {
  return <div className="os-root dark min-h-dvh" data-accent="ember">{children}</div>;
}
