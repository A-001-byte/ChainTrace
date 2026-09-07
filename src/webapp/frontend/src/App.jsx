import { useState } from "react";
import TopBar from "./components/layout/TopBar";
import Sidebar from "./components/layout/Sidebar";
import Overview from "./components/overview/Overview";
import AlertsPage from "./components/alerts/AlertsPage";
import GraphPanel from "./components/graph/GraphPanel";
import GeoPage from "./components/geo/GeoPage";
import PatternPage from "./components/pattern/PatternPage";
import SystemPage from "./components/system/SystemPage";

function Placeholder({ name }) {
  return (
    <div style={{ color: "var(--text-secondary)" }}>
      <h2 style={{ color: "var(--text-primary)", marginBottom: "0.5rem" }}>{name}</h2>
      <p>This section will be wired to real data in a later step.</p>
    </div>
  );
}

export default function App() {
  const [active, setActive] = useState("overview");
  const [selectedNodeId, setSelectedNodeId] = useState(null);

  const labels = {
    overview: "Overview",
    alerts: "Alerts",
    graph: "Forensic Graph",
    geo: "Geo Intelligence",
    pattern: "Pattern Intelligence",
    system: "System / About",
  };

  return (
    <div className="app-shell">
      <TopBar />
      <Sidebar active={active} onSelect={setActive} />
      <main className="main-content">
        {active === "overview" && <Overview />}

        {active === "alerts" && (
          <AlertsPage selectedNodeId={selectedNodeId} onSelectNode={setSelectedNodeId} />
        )}

        {active === "graph" && <GraphPanel focusNodeId={selectedNodeId} />}

        {active === "geo" && <GeoPage />}

        {active === "pattern" && <PatternPage />}

        {active === "system" && <SystemPage />}
      </main>
    </div>
  );
}