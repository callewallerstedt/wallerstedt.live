"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";

export function MotionEffects() {
  const pathname = usePathname();

  useEffect(() => {
    const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    if (prefersReducedMotion) {
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

    const featuredScrollCleanups: Array<() => void> = [];
    const featuredScrollTargets = document.querySelectorAll<HTMLElement>("[data-featured-scroller]");

    const easeInOut = (value: number) => {
      return value < 0.5
        ? 2 * value * value
        : 1 - Math.pow(-2 * value + 2, 2) / 2;
    };

    featuredScrollTargets.forEach((node) => {
      if (!window.matchMedia("(max-width: 780px)").matches) {
        return;
      }

      const maxScroll = node.scrollWidth - node.clientWidth;
      if (maxScroll < 24) {
        return;
      }

      let stopped = false;
      let frameId = 0;
      let timeoutId = 0;
      let direction: 1 | -1 = 1;

      const stopAutoScroll = () => {
        if (stopped) {
          return;
        }

        stopped = true;
        window.cancelAnimationFrame(frameId);
        window.clearTimeout(timeoutId);
      };

      const animateBetween = (from: number, to: number, duration: number, onDone: () => void) => {
        let startTime = 0;

        const step = (timestamp: number) => {
          if (stopped) {
            return;
          }

          if (!startTime) {
            startTime = timestamp;
          }

          const progress = Math.min((timestamp - startTime) / duration, 1);
          node.scrollLeft = from + (to - from) * easeInOut(progress);

          if (progress < 1) {
            frameId = window.requestAnimationFrame(step);
            return;
          }

          onDone();
        };

        frameId = window.requestAnimationFrame(step);
      };

      const runCycle = () => {
        if (stopped) {
          return;
        }

        const from = direction === 1 ? 0 : maxScroll;
        const to = direction === 1 ? maxScroll : 0;

        animateBetween(from, to, 3600, () => {
          if (stopped) {
            return;
          }

          direction = direction === 1 ? -1 : 1;
          timeoutId = window.setTimeout(runCycle, 900);
        });
      };

      timeoutId = window.setTimeout(runCycle, 1200);

      const interactionEvents: Array<keyof HTMLElementEventMap> = ["pointerdown", "touchstart", "wheel"];
      interactionEvents.forEach((eventName) => {
        node.addEventListener(eventName, stopAutoScroll, { passive: true, once: true });
      });

      featuredScrollCleanups.push(() => {
        stopAutoScroll();
        interactionEvents.forEach((eventName) => {
          node.removeEventListener(eventName, stopAutoScroll);
        });
      });
    });

    return () => {
      revealObserver.disconnect();
      featuredScrollCleanups.forEach((cleanup) => cleanup());
    };
  }, [pathname]);

  return null;
}
