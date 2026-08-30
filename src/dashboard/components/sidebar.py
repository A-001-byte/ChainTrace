"""ChainTrace Sidebar & How It Works Component."""

from __future__ import annotations

from pathlib import Path
from typing import Any

import streamlit as st

# Default pipeline output locations (repo-root relative, matches scripts/data_pipeline.py's
# and src/graph_ml/run_phase2.py's own output paths). Resolved from this file's location
# rather than cwd, so auto-load still works regardless of where `streamlit run` is invoked from.
_REPO_ROOT = Path(__file__).resolve().parents[3]
DEFAULT_TX_PATH = _REPO_ROOT / "data" / "processed" / "unified_dataset.csv"
DEFAULT_ALERTS_PATH = _REPO_ROOT / "outputs" / "alerts" / "ranked_alerts.csv"


def render_sidebar() -> tuple[Any, Any, bool]:
    """Render sidebar control panel and system explainer.

    Returns:
        (tx_file, alerts_file, reset_mock_data_clicked)

        tx_file/alerts_file are either a path string (auto-loaded default pipeline output),
        a Streamlit UploadedFile (manual upload), or None (nothing available — falls through
        to mock data in data_loader.get_active_datasets).
    """
    with st.sidebar:
        st.markdown(
            """
            <div style="text-align: center; padding-bottom: 0.5rem; border-bottom: 1px solid #232f48; margin-bottom: 1rem;">
                <h2 style="margin: 0; font-size: 1.4rem; color: #00e5ff;">🔍 ChainTrace Engine</h2>
                <span style="font-size: 0.78rem; color: #94a3b8;">SIH26146 Bitcoin Forensic Pipeline</span>
            </div>
            """,
            unsafe_allow_html=True,
        )

        st.markdown("### 📁 Data Ingestion Pipeline")

        auto_load_ready = DEFAULT_TX_PATH.exists() and DEFAULT_ALERTS_PATH.exists()

        if auto_load_ready:
            # Both pipeline outputs already sit on disk (run_all.sh/.bat, or the pipelines run
            # manually) — load them straight away, no upload click needed.
            st.success("✅ Pipeline outputs found on disk — auto-loaded, no upload needed.")
            st.caption(f"Transactions: `{DEFAULT_TX_PATH.relative_to(_REPO_ROOT)}`")
            st.caption(f"Alerts: `{DEFAULT_ALERTS_PATH.relative_to(_REPO_ROOT)}`")
            tx_file: Any = str(DEFAULT_TX_PATH)
            alerts_file: Any = str(DEFAULT_ALERTS_PATH)
        else:
            # One or both pipeline outputs are missing (dashboard-only development, or the
            # pipelines haven't been run yet) — fall back to manual upload exactly as before.
            st.caption("Upload pipeline outputs or run offline mock data mode.")

            tx_file = st.file_uploader(
                "Transaction Stream (CSV/JSON)",
                type=["csv", "json"],
                help="Merged Elliptic dataset + synthetic network metadata (IP, port, geo, ASN)",
            )

            alerts_file = st.file_uploader(
                "ML Pipeline Output (CSV/JSON)",
                type=["csv", "json"],
                help="Ranked alerts dataframe output by Phase 2 graph + ML scoring model",
            )

        reset_clicked = st.button("🔄 Reset to Realistic Mock Data", use_container_width=True)

        st.markdown("---")

        # "How It Works" Narrative Explainer for Demo Video Presentation
        st.markdown("### ⚙️ How It Works (Demo Guide)")

        with st.expander("📖 5-Stage Pipeline Narrative", expanded=True):
            st.markdown(
                """
                **1. Data Ingestion & Fusion**
                Fuses raw Bitcoin transaction logs + wallet addresses (Elliptic/Elliptic++) with synthetic network-layer metadata (IP, Port, GeoIP, ASN).

                **2. Unified Graph Construction**
                Constructs a NetworkX entity-transaction graph mapping interactions across wallets $\\leftrightarrow$ transactions $\\leftrightarrow$ IP endpoints.

                **3. Louvain Community Detection**
                Groups wallets into topological clusters to uncover laundering rings and fan-out structures.

                **4. Ensemble ML Scoring**
                Blends Random Forest illicit probability (55%) + Isolation Forest anomaly score (35%) + Louvain cluster risk bonus (10%).

                **5. Explainable Lead Generation**
                Extracts top feature importances per node to provide human-readable "Why Flagged" explanations.
                """
            )

        st.markdown("---")
        st.markdown("### 🔒 Security & Deployment")
        st.info(
            "**100% Offline Capability**\n"
            "• Zero external API dependencies\n"
            "• Runs locally on standard CPU laptop\n"
            "• Air-gapped network defense architecture"
        )

    return tx_file, alerts_file, reset_clicked
