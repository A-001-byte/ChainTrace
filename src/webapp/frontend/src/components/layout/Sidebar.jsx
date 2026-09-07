const SECTIONS = [
  { id: "overview", label: "Overview" },
  { id: "alerts", label: "Alerts" },
  { id: "graph", label: "Forensic Graph" },
  { id: "geo", label: "Geo Intelligence" },
  { id: "pattern", label: "Pattern Intelligence" },
  { id: "system", label: "System / About" },
];

export default function Sidebar({ active, onSelect }) {
  return (
    <nav className="sidebar">
      {SECTIONS.map((s) => (
        <button
          key={s.id}
          className={`nav-item ${active === s.id ? "active" : ""}`}
          onClick={() => onSelect(s.id)}
        >
          {s.label}
        </button>
      ))}
    </nav>
  );
}