import { motion, useReducedMotion } from "motion/react";
import { motionTokens } from "../../lib/motionTokens";

const SECTIONS = [
  { id: "overview", label: "Overview" },
  { id: "alerts", label: "Alerts" },
  { id: "graph", label: "Forensic Graph" },
  { id: "geo", label: "Geo Intelligence" },
  { id: "pattern", label: "Pattern Intelligence" },
  { id: "system", label: "System / About" },
];

export default function Sidebar({ active, onSelect }) {
  const reduceMotion = useReducedMotion();

  return (
    <nav className="sidebar">
      {SECTIONS.map((s) => {
        const isActive = active === s.id;
        return (
          <div key={s.id} className="nav-item-wrap">
            {isActive && (
              <motion.div
                layoutId="sidebar-active-indicator"
                className="nav-item-indicator"
                // Explicit `false`: the indicator is a shared element that glides between
                // items via layoutId, so it must never play a mount animation from an
                // implicit origin -- only the layout transition between positions.
                initial={false}
                transition={
                  reduceMotion
                    ? { duration: 0 }
                    : { duration: motionTokens.duration.normal, ease: motionTokens.easing.smooth }
                }
              />
            )}
            <button
              className={`nav-item ${isActive ? "active" : ""}`}
              onClick={() => onSelect(s.id)}
            >
              {s.label}
            </button>
          </div>
        );
      })}
    </nav>
  );
}
