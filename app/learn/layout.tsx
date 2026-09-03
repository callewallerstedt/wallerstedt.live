import { Footer } from "@/components/Footer";
import { MotionEffects } from "@/components/MotionEffects";
import { SiteHeader } from "@/components/SiteHeader";
import { getSiteContent } from "@/lib/site-content";

export default async function LearnLayout({ children }: { children: React.ReactNode }) {
  const siteContent = await getSiteContent();

  return (
    <div className="archive-shell">
      <MotionEffects />
      <SiteHeader />
      {children}
      <Footer contactEmail={siteContent.contactEmail} />
    </div>
  );
}
