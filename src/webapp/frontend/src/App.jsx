import { useEffect, useState } from "react";
import { TopNav, FootBar } from "./components/shell/Shell";
import { SECTIONS } from "./lib/sections";
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
  const [selected, setSelected] = useState(null); // graph focus / KDD target
  const [drawer, setDrawer] = useState(null);     // open record, tracked separately

  const open = (id) => { setSelected(id); setDrawer(id); };
  const toGraph = (id) => { setSelected(id); setDrawer(null); setActive("graph"); };

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
      <TopNav active={active} onSelect={setActive} onLookup={open} />
      <main className="page">
        {active === "overview" && <OverviewPage onOpen={open} onNav={setActive} />}
        {active === "alerts" && <AlertsPage onOpen={open} selected={selected} />}
        {active === "graph" && <GraphPage focus={selected} onOpen={open} />}
        {active === "kickdown" && <KickDownPage selected={selected} onSelect={setSelected} />}
        {active === "provenance" && <ProvenancePage />}
        {active === "geo" && <GeoPage />}
        {active === "pattern" && <PatternPage />}
        {active === "system" && <SystemPage />}
      </main>
      <FootBar />
      <EntityDrawer nodeId={drawer} onClose={() => setDrawer(null)} onGraph={toGraph} />
    </div>
  );
}
