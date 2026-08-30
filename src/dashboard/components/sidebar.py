"""ChainTrace Sidebar & How It Works Component."""

from __future__ import annotations

from typing import Any

import streamlit as st


def render_sidebar() -> tuple[Any, Any, bool]:
    """Render sidebar control panel and system explainer.

    Returns:
        (uploaded_tx_file, uploaded_alerts_file, reset_mock_data_clicked)
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
