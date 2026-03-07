"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";

export function MotionEffects() {
  const pathname = usePathname();

  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      document.querySelectorAll<HTMLElement>("[data-reveal]").forEach((node) => {
        node.classList.add("is-visible");
      });
      return;
    }

    const revealTargets = document.querySelectorAll<HTMLElement>("[data-reveal]");
    const revealObserver = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add("is-visible");
            revealObserver.unobserve(entry.target);
          }
        });
      },
      { threshold: 0.08, rootMargin: "0px 0px -8% 0px" },
    );

    revealTargets.forEach((node, index) => {
      node.style.setProperty("--reveal-delay", `${Math.min(index * 35, 140)}ms`);
      revealObserver.observe(node);
    });

    return () => {
      revealObserver.disconnect();
    };
  }, [pathname]);

  return null;
}
