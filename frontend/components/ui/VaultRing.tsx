"use client";

import { motion, useReducedMotion, useTransform, type MotionValue } from "framer-motion";
import { EASE } from "./motion";

const C = 200;
const STATES = ["Open", "Locked", "Matured", "Approved", "Closed"];
// Lifecycle nodes sit on the upper arc, read left to right like a timeline.
const NODE_ANGLES = [-160, -125, -90, -55, -20];

/**
 * Math.cos and Math.sin are implementation-defined in the last bits, so Node and the browser can
 * disagree there and React then reports a hydration mismatch. Rounding to three decimals is far
 * coarser than that difference and far finer than a pixel.
 */
function round(v: number) {
  return Math.round(v * 1000) / 1000;
}

function polar(r: number, deg: number) {
  const a = (deg * Math.PI) / 180;
  return { x: round(C + r * Math.cos(a)), y: round(C + r * Math.sin(a)) };
}

/**
 * The vault drawn from live contract data: the green arc is the share of the quota
 * subscribed, and the five nodes are the lifecycle with the current state filled.
 * `scroll` (0..1) turns the outer scale and lifts the layers apart as the page moves.
 */
export function VaultRing({
  filledPct,
  state,
  configured,
  scroll,
}: {
  filledPct: number;
  state: number;
  configured: boolean;
  scroll: MotionValue<number>;
}) {
  const reduce = useReducedMotion();
  const rotate = useTransform(scroll, [0, 1], [0, 32]);
  const lift = useTransform(scroll, [0, 1], [0, -26]);
  const sink = useTransform(scroll, [0, 1], [0, 18]);
  const arc = Math.max(0, Math.min(100, filledPct)) / 100;

  return (
    <svg viewBox="0 0 400 400" className="h-full w-full overflow-visible" role="img" aria-label={`Vault ${configured ? `${filledPct.toFixed(1)} percent subscribed, state ${STATES[state] ?? "unknown"}` : "not configured"}`}>
      <defs>
        <radialGradient id="vr-core" cx="50%" cy="42%" r="60%">
          <stop offset="0%" stopColor="#ffffff" />
          <stop offset="100%" stopColor="#f0f8f3" />
        </radialGradient>
      </defs>

      {/* Outer scale: 120 ticks, every tenth longer. Turns with scroll, never on its own. */}
      <motion.g style={reduce ? undefined : { rotate, originX: "200px", originY: "200px" }}>
        {Array.from({ length: 120 }, (_, i) => {
          const long = i % 10 === 0;
          const a = polar(long ? 176 : 181, i * 3);
          const b = polar(188, i * 3);
          return (
            <line
              key={i}
              x1={a.x}
              y1={a.y}
              x2={b.x}
              y2={b.y}
              stroke={long ? "#8fc4a6" : "#cdebd9"}
              strokeWidth={long ? 1.6 : 1}
              strokeLinecap="round"
            />
          );
        })}
      </motion.g>

      {/* Quota ring */}
      <motion.g style={reduce ? undefined : { y: sink }}>
        <circle cx={C} cy={C} r={156} fill="none" stroke="#e3f3ea" strokeWidth={16} />
        <motion.circle
          cx={C}
          cy={C}
          r={156}
          fill="none"
          stroke="#16603f"
          strokeWidth={16}
          strokeLinecap="round"
          transform={`rotate(-90 ${C} ${C})`}
          initial={{ pathLength: 0 }}
          animate={{ pathLength: configured ? Math.max(arc, 0.002) : 0 }}
          transition={{ duration: 1.8, delay: 0.3, ease: EASE }}
        />
      </motion.g>

      {/* Lifecycle nodes */}
      <motion.g style={reduce ? undefined : { y: lift }}>
        <path
          d={`M ${polar(122, NODE_ANGLES[0]).x} ${polar(122, NODE_ANGLES[0]).y} A 122 122 0 0 1 ${polar(122, NODE_ANGLES[4]).x} ${polar(122, NODE_ANGLES[4]).y}`}
          fill="none"
          stroke="#cadbd1"
          strokeWidth={1.5}
          strokeDasharray="2 5"
          strokeLinecap="round"
        />
        {NODE_ANGLES.map((deg, i) => {
          const p = polar(122, deg);
          const current = configured && i === state;
          const done = configured && i < state;
          return (
            <motion.g
              key={i}
              initial={{ opacity: 0, scale: 0.4 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.6, delay: 0.6 + i * 0.08, ease: EASE }}
              style={{ originX: `${p.x}px`, originY: `${p.y}px` }}
            >
              {current && <circle cx={p.x} cy={p.y} r={15} fill="#e4f5c4" />}
              <circle
                cx={p.x}
                cy={p.y}
                r={current ? 8 : 5.5}
                fill={current || done ? "#16603f" : "#ffffff"}
                stroke="#16603f"
                strokeWidth={current || done ? 0 : 1.5}
              />
            </motion.g>
          );
        })}
      </motion.g>

      <circle cx={C} cy={C} r={92} fill="url(#vr-core)" stroke="#e1ece5" strokeWidth={1} />
    </svg>
  );
}

export { STATES as VAULT_STATE_SHORT };
