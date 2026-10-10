"use client";

import React, { useRef, useState } from "react";
import {
  motion,
  useReducedMotion,
  useScroll,
  useSpring,
  useTransform,
  type MotionValue,
} from "framer-motion";

export const EASE = [0.16, 1, 0.3, 1] as const;
export const SPRING = { type: "spring", stiffness: 220, damping: 26, mass: 0.6 } as const;

export function PageTransition({ children }: { children: React.ReactNode }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.6, ease: EASE }}
      className="w-full"
    >
      {children}
    </motion.div>
  );
}

/** Rises into place the first time it scrolls into view. */
export function Reveal({
  children,
  className = "",
  delay = 0,
  y = 24,
  as = "div",
}: {
  children: React.ReactNode;
  className?: string;
  delay?: number;
  y?: number;
  as?: "div" | "section" | "li";
}) {
  const Tag = motion[as];
  return (
    <Tag
      initial={{ opacity: 0, y }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-60px" }}
      transition={{ duration: 0.8, delay, ease: EASE }}
      className={className}
    >
      {children}
    </Tag>
  );
}

export function Stagger({
  children,
  className = "",
  gap = 0.08,
}: {
  children: React.ReactNode;
  className?: string;
  gap?: number;
}) {
  return (
    <motion.div
      initial="hidden"
      whileInView="show"
      viewport={{ once: true, margin: "-60px" }}
      variants={{ hidden: {}, show: { transition: { staggerChildren: gap } } }}
      className={className}
    >
      {children}
    </motion.div>
  );
}

export function StaggerItem({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <motion.div
      variants={{
        hidden: { opacity: 0, y: 20 },
        show: { opacity: 1, y: 0, transition: { duration: 0.7, ease: EASE } },
      }}
      className={className}
    >
      {children}
    </motion.div>
  );
}

/** Reading-position bar under the header. */
export function ScrollProgressBar() {
  const { scrollYProgress } = useScroll();
  const scaleX = useSpring(scrollYProgress, { stiffness: 200, damping: 32, mass: 0.3 });
  return (
    <motion.div
      style={{ scaleX }}
      className="fixed inset-x-0 top-0 z-[60] h-[2px] origin-left bg-forest"
      aria-hidden="true"
    />
  );
}

/** Scroll progress of an element through the viewport, smoothed with a spring. */
export function useElementScroll(
  offset: ["start end" | "start start", "end start" | "end end"] = ["start end", "end start"],
) {
  const ref = useRef<HTMLDivElement>(null);
  const { scrollYProgress } = useScroll({ target: ref, offset });
  const smooth = useSpring(scrollYProgress, { stiffness: 120, damping: 26, mass: 0.4 });
  return { ref, progress: smooth, raw: scrollYProgress };
}

/**
 * Moves its content against the scroll by `distance` px, so layers at different
 * distances separate in depth. Scroll-driven only: nothing moves while idle.
 */
export function Parallax({
  children,
  distance = 60,
  className = "",
}: {
  children: React.ReactNode;
  distance?: number;
  className?: string;
}) {
  const reduce = useReducedMotion();
  const { ref, progress } = useElementScroll();
  const y = useTransform(progress, [0, 1], [distance, -distance]);
  return (
    <div ref={ref} className={className}>
      <motion.div style={reduce ? undefined : { y }} className="will-change-transform">
        {children}
      </motion.div>
    </div>
  );
}

/** Counts from the previous value to the new one, so a changed figure is noticed. */
export function AnimatedNumber({
  value,
  decimals = 0,
  suffix = "",
  duration = 1.1,
}: {
  value: number;
  decimals?: number;
  suffix?: string;
  duration?: number;
}) {
  const reduce = useReducedMotion();
  const [display, setDisplay] = useState(0);
  const target = useRef<number | null>(null);

  function run() {
    if (target.current === value) return;
    target.current = value;
    if (reduce) {
      setDisplay(value);
      return;
    }
    const from = display;
    const start = performance.now();
    const step = (now: number) => {
      const t = Math.min((now - start) / (duration * 1000), 1);
      setDisplay(from + (value - from) * (1 - Math.pow(1 - t, 4)));
      if (t < 1) requestAnimationFrame(step);
      else setDisplay(value);
    };
    requestAnimationFrame(step);
  }

  return (
    <motion.span className="figure" onViewportEnter={run} viewport={{ amount: 0.4 }}>
      {display.toLocaleString("en-US", {
        minimumFractionDigits: decimals,
        maximumFractionDigits: decimals,
      })}
      {suffix}
    </motion.span>
  );
}

/** Tactile press: the control dips on click before the wallet prompt appears. */
export function Press({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <motion.div
      whileTap={{ scale: 0.97 }}
      transition={SPRING}
      // The wrapper is decoration; the control inside keeps the tab stop.
      tabIndex={-1}
      className={`inline-flex ${className}`}
    >
      {children}
    </motion.div>
  );
}

/** Headline that rises line by line. Screen readers get the plain sentence. */
export function LineReveal({
  lines,
  className = "",
  delay = 0,
}: {
  lines: React.ReactNode[];
  className?: string;
  delay?: number;
}) {
  return (
    <motion.span
      initial="hidden"
      animate="show"
      variants={{ hidden: {}, show: { transition: { staggerChildren: 0.09, delayChildren: delay } } }}
      className={`block ${className}`}
    >
      {lines.map((line, i) => (
        <span key={i} className="block overflow-hidden pb-[0.08em]">
          <motion.span
            className="block"
            variants={{
              hidden: { y: "110%" },
              show: { y: 0, transition: { duration: 1, ease: EASE } },
            }}
          >
            {line}
          </motion.span>
        </span>
      ))}
    </motion.span>
  );
}

/** The highlighter motif, drawn left to right when it enters the viewport. */
export function Mark({ children }: { children: React.ReactNode }) {
  const [inView, setInView] = useState(false);
  return (
    <motion.span
      className="mark"
      onViewportEnter={() => setInView(true)}
      viewport={{ once: true, amount: 0.8 }}
      style={{ "--mark-scale": inView ? 1 : 0 } as React.CSSProperties}
    >
      {children}
    </motion.span>
  );
}

export type { MotionValue };
