import { useEffect, useState } from "react";
import { Topbar, Nav, Statusbar, SECTIONS } from "./components/shell/Shell";
import EntityDrawer from "./components/EntityDrawer";
import OverviewPage from "./components/pages/OverviewPage";
import AlertsPage from "./components/pages/AlertsPage";
import GraphPage from "./components/pages/GraphPage";
import KickDownPage from "./components/pages/KickDownPage";
import ProvenancePage from "./components/pages/ProvenancePage";
import GeoPage from "./components/pages/GeoPage";
import PatternPage from "./components/pages/PatternPage";
import SystemPage from "./components/pages/SystemPage";

export default function App() {
  const [active, setActive] = useState("overview");
  // Selected entity drives graph focus and the Kick Down Doors target; the drawer is
  // tracked separately so closing it doesn't discard that selection.
  const [selected, setSelected] = useState(null);
  const [drawer, setDrawer] = useState(null);

  const open = (id) => { setSelected(id); setDrawer(id); };
  const toGraph = (id) => { setSelected(id); setDrawer(null); setActive("graph"); };

  // F1–F8 jump between sections; Esc closes the drawer. Console muscle memory.
  useEffect(() => {
    const onKey = (e) => {
      if (e.key === "Escape") { setDrawer(null); return; }
      const s = SECTIONS.find((x) => x.key === e.key);
      if (s) { e.preventDefault(); setActive(s.id); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <div className="shell">
      <Topbar onLookup={open} />
      <Nav active={active} onSelect={setActive} />
      <main className="main">
        {active === "overview" && <OverviewPage onOpen={open} onNav={setActive} />}
        {active === "alerts" && <AlertsPage onOpen={open} selected={selected} />}
        {active === "graph" && <GraphPage focus={selected} onOpen={open} />}
        {active === "kickdown" && <KickDownPage selected={selected} onSelect={setSelected} />}
        {active === "provenance" && <ProvenancePage />}
        {active === "geo" && <GeoPage />}
        {active === "pattern" && <PatternPage />}
        {active === "system" && <SystemPage />}
      </main>
      <Statusbar />
      <EntityDrawer nodeId={drawer} onClose={() => setDrawer(null)} onGraph={toGraph} />
    </div>
  );
}
