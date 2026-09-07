import { useState } from "react";
import TopBar from "./components/layout/TopBar";
import Sidebar from "./components/layout/Sidebar";
import Overview from "./components/overview/Overview";
import AlertsPage from "./components/alerts/AlertsPage";
import EntityDetailDrawer from "./components/alerts/EntityDetailDrawer";
import GraphPanel from "./components/graph/GraphPanel";
import GeoPage from "./components/geo/GeoPage";
import PatternPage from "./components/pattern/PatternPage";
import KickDownDoorsPage from "./components/kickdown/KickDownDoorsPage";
import SystemPage from "./components/system/SystemPage";

export default function App() {
  const [active, setActive] = useState("overview");
  // The entity whose row/node is selected -- drives graph focus and the Kick Down Doors page.
  const [selectedNodeId, setSelectedNodeId] = useState(null);
  // The entity whose drawer is open. Kept separate from selectedNodeId so closing the
  // drawer doesn't also blow away graph focus / the Kick Down Doors target.
  const [drawerNodeId, setDrawerNodeId] = useState(null);

  function openEntity(nodeId) {
    setSelectedNodeId(nodeId);
    setDrawerNodeId(nodeId);
  }

  return (
    <div className="app-shell">
      {/* Search lives in the header so an analyst can pull up any entity from any page.
          Read-only lookup over existing pipeline output -- not an ingestion control. */}
      <TopBar onLookupEntity={openEntity} />
      <Sidebar active={active} onSelect={setActive} />

      <main className="main-content">
        {active === "overview" && (
          <Overview onSelectEntity={openEntity} onNavigate={setActive} />
        )}

        {active === "alerts" && <AlertsPage onSelectNode={openEntity} />}

        {active === "graph" && (
          <GraphPanel focusNodeId={selectedNodeId} onSelectNode={openEntity} />
        )}

        {active === "kickdown" && (
          <KickDownDoorsPage selectedNodeId={selectedNodeId} onSelectNode={setSelectedNodeId} />
        )}

        {active === "geo" && <GeoPage />}

        {active === "pattern" && <PatternPage />}

        {active === "system" && <SystemPage />}
      </main>

      {/* Hoisted to app level so the drawer opens from the Overview preview, the alert
          tables, a graph node click, or the header search -- one drawer, one code path. */}
      <EntityDetailDrawer nodeId={drawerNodeId} onClose={() => setDrawerNodeId(null)} />
    </div>
  );
}
