import { Fragment } from "react";
import { motion, useReducedMotion } from "motion/react";
import { motionTokens } from "../../lib/motionTokens";

const SECTIONS = [
  { id: "overview", label: "Overview", group: "Monitor" },
  { id: "alerts", label: "Alerts", group: "Monitor" },
  { id: "graph", label: "Forensic Graph", group: "Investigate" },
  { id: "kickdown", label: "Kick Down Doors", group: "Investigate" },
  { id: "provenance", label: "Adversarial Provenance", group: "Investigate" },
  { id: "geo", label: "Geo Intelligence", group: "Intelligence" },
  { id: "pattern", label: "Pattern Intelligence", group: "Intelligence" },
  { id: "system", label: "System / About", group: "Intelligence" },
];

export default function Sidebar({ active, onSelect }) {
  const reduceMotion = useReducedMotion();

  return (
    <nav className="sidebar">
      {SECTIONS.map((s, i) => {
        const isActive = active === s.id;
        const startsGroup = i === 0 || SECTIONS[i - 1].group !== s.group;
        return (
          <Fragment key={s.id}>
            {/* Grouped so the sidebar reads as a workflow (monitor -> investigate ->
                intelligence) instead of a flat list of seven equal-weight links.
                Kept OUTSIDE .nav-item-wrap: the active indicator is inset:0 on that
                wrapper and would otherwise paint over the heading. */}
            {startsGroup && <div className="sidebar-heading">{s.group}</div>}
            <div className="nav-item-wrap">
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
          </Fragment>
        );
      })}
    </nav>
  );
}
