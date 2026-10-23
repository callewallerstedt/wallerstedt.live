"use client";

import { usePathname } from "next/navigation";
import { useEffect } from "react";

/** The soft accent glow and grain that sit behind every page. */
export function Atmosphere() {
  return (
    <>
      <div className="wl-aura" aria-hidden="true" />
      <div className="wl-grain" aria-hidden="true" />
    </>
  );
}

/**
 * Fades and lifts anything marked `data-reveal` as it scrolls into view. The
 * "seen" flag is a data attribute, not a class, because React rewrites
 * `className` on re-render (e.g. a track row turning current) and would wipe it.
 */
export function Reveal() {
  const pathname = usePathname();

  useEffect(() => {
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (!entry.isIntersecting) return;
          entry.target.setAttribute("data-in", "");
          observer.unobserve(entry.target);
        });
      },
      { threshold: 0.08, rootMargin: "0px 0px -8% 0px" },
    );

    const watch = (root: ParentNode) => {
      root.querySelectorAll<HTMLElement>("[data-reveal]:not([data-in])").forEach((node) => {
        if (reduce) {
          node.setAttribute("data-in", "");
          return;
        }
        const stagger = Number(node.dataset.reveal) || 0;
        node.style.setProperty("--delay", `${Math.min(stagger * 80, 640)}ms`);
        observer.observe(node);
      });
    };

    watch(document);

    // Filters and players swap content in after load; pick those up too.
    const mutations = new MutationObserver(() => watch(document));
    mutations.observe(document.querySelector(".wl-main") ?? document.body, { childList: true, subtree: true });

    return () => {
      observer.disconnect();
      mutations.disconnect();
    };
  }, [pathname]);

  return null;
}
