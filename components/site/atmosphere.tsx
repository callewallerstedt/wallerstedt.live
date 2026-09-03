"use client";

import { usePathname } from "next/navigation";
import { useEffect, useRef } from "react";

/** Film grain, the accent aura, and the vignette that frames the whole page. */
export function Atmosphere() {
  return (
    <>
      <div className="wl-aura" aria-hidden="true" />
      <div className="wl-vignette" aria-hidden="true" />
      <div className="wl-grain" aria-hidden="true" />
    </>
  );
}

/**
 * A soft ring that trails the pointer and swells into a PLAY target over
 * anything playable. Desktop only — coarse pointers never see it.
 */
export function Cursor() {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const node = ref.current;
    if (!node) return;
    if (!window.matchMedia("(hover: hover) and (pointer: fine)").matches) return;

    let x = window.innerWidth / 2;
    let y = window.innerHeight / 2;
    let renderX = x;
    let renderY = y;
    let frame = 0;

    const onMove = (event: PointerEvent) => {
      x = event.clientX;
      y = event.clientY;
      node.classList.add("is-on");

      const target = (event.target as HTMLElement | null)?.closest<HTMLElement>("[data-cursor]");
      node.classList.toggle("is-play", target?.dataset.cursor === "play");
    };

    const onLeave = () => node.classList.remove("is-on");

    const tick = () => {
      renderX += (x - renderX) * 0.18;
      renderY += (y - renderY) * 0.18;
      node.style.transform = `translate3d(${renderX}px, ${renderY}px, 0)`;
      frame = requestAnimationFrame(tick);
    };

    window.addEventListener("pointermove", onMove, { passive: true });
    document.addEventListener("pointerleave", onLeave);
    frame = requestAnimationFrame(tick);

    return () => {
      window.removeEventListener("pointermove", onMove);
      document.removeEventListener("pointerleave", onLeave);
      cancelAnimationFrame(frame);
    };
  }, []);

  return (
    <div className="wl-cursor" ref={ref} aria-hidden="true">
      <span className="wl-cursor__label">Play</span>
    </div>
  );
}

/** Fades and lifts anything marked `data-wl-reveal` as it enters the viewport. */
export function Reveal() {
  const pathname = usePathname();

  useEffect(() => {
    const targets = Array.from(document.querySelectorAll<HTMLElement>("[data-wl-reveal]"));
    if (!targets.length) return;

    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      targets.forEach((node) => node.classList.add("is-in"));
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (!entry.isIntersecting) return;
          entry.target.classList.add("is-in");
          observer.unobserve(entry.target);
        });
      },
      { threshold: 0.06, rootMargin: "0px 0px -6% 0px" },
    );

    targets.forEach((node) => {
      const stagger = Number(node.dataset.wlReveal) || 0;
      node.style.setProperty("--wl-delay", `${Math.min(stagger * 70, 420)}ms`);
      observer.observe(node);
    });

    return () => observer.disconnect();
  }, [pathname]);

  return null;
}
