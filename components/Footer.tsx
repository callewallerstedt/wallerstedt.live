 "use client";

import { useRouter } from "next/navigation";
import { useRef } from "react";

export function Footer({ contactEmail }: { contactEmail: string }) {
  const router = useRouter();
  const clickCountRef = useRef(0);
  const clickTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  function handleCopyrightClick() {
    clickCountRef.current += 1;

    if (clickTimerRef.current) {
      clearTimeout(clickTimerRef.current);
    }

    if (clickCountRef.current >= 3) {
      clickCountRef.current = 0;
      clickTimerRef.current = null;
      router.push("/admin");
      return;
    }

    clickTimerRef.current = setTimeout(() => {
      clickCountRef.current = 0;
      clickTimerRef.current = null;
    }, 500);
  }

  return (
    <footer className="footer">
      <div className="container footer__row">
        <button className="footer__copyright" type="button" onClick={handleCopyrightClick}>
          &copy; {new Date().getFullYear()} Wallerstedt Productions AB
        </button>
        <a className="footer__contact" href={`mailto:${contactEmail}`}>
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path fill="currentColor" d="M3 5.5A2.5 2.5 0 0 1 5.5 3h13A2.5 2.5 0 0 1 21 5.5v13a2.5 2.5 0 0 1-2.5 2.5h-13A2.5 2.5 0 0 1 3 18.5Zm2.2-.7 6.8 5.24L18.8 4.8A.67.67 0 0 0 18.5 4h-13a.67.67 0 0 0-.3.8Zm14.46 1.38-7.26 5.6a.7.7 0 0 1-.85 0l-7.21-5.56V18.5c0 .72.58 1.3 1.3 1.3h13c.72 0 1.3-.58 1.3-1.3Z" />
          </svg>
          <span>{contactEmail}</span>
        </a>
      </div>
    </footer>
  );
}
