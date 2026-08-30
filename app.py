"""ChainTrace — Offline Bitcoin Forensic Lead Detection Engine.

Streamlit Dashboard Entry Point for SIH26146.
Fuses Bitcoin blockchain data with synthetic network metadata for ML-driven suspicious entity detection.
"""

from __future__ import annotations

import streamlit as st

from src.dashboard.components.alerts_table import render_alerts_table
from src.dashboard.components.geo_overlay import render_geo_overlay
from src.dashboard.components.graph_container import render_graph_section
from src.dashboard.components.header import render_header
from src.dashboard.components.sidebar import render_sidebar
from src.dashboard.components.stats import render_stat_cards
from src.dashboard.config import apply_theme, set_page_config
from src.dashboard.data_loader import get_active_datasets


def main() -> None:
    # 1. Page Configuration & Custom Dark Cyber-Forensic Theme
    set_page_config()
    apply_theme()

    # 2. Sidebar Navigation & Data Upload Panel
    tx_file, alerts_file, reset_clicked = render_sidebar()

    # Reset mock data trigger
    if reset_clicked:
        st.session_state.pop("selected_entity", None)
        tx_file = None
        alerts_file = None
        st.toast("Reset to clean synthetic mock dataset.", icon="🔄")

    # 3. Master Data Ingestion & Fallback Data Loading
    tx_df, alerts_df, data_source_label, warnings = get_active_datasets(
        tx_file_input=tx_file, alerts_file_input=alerts_file
    )

    # 4. Header Banner & Status Indicators
    render_header(data_source_label=data_source_label, warnings=warnings)

    # 5. Top Summary Stat Cards
    render_stat_cards(tx_df=tx_df, alerts_df=alerts_df)

    st.markdown("---")

    # 6. Tabbed Dashboard Navigation
    tab_alerts, tab_graph, tab_geo, tab_raw = st.tabs(
        [
            "🚨 Ranked Alert Leads",
            "🕸️ Entity-Transaction Graph",
            "🌐 Geo & ASN Overlay",
            "📊 Ingested Transaction Stream",
        ]
    )

    # State tracking for entity drill-down selection across tabs
    selected_entity = st.session_state.get("selected_entity", None)

    with tab_alerts:
        selected_from_table = render_alerts_table(alerts_df=alerts_df, tx_df=tx_df)
        if selected_from_table:
            selected_entity = selected_from_table

    with tab_graph:
        render_graph_section(selected_entity=selected_entity, alerts_df=alerts_df, tx_df=tx_df)

    with tab_geo:
        render_geo_overlay(alerts_df=alerts_df, tx_df=tx_df)

    with tab_raw:
        st.markdown("### 📊 Ingested Blockchain & Network Metadata Stream")
        st.caption("Raw unified dataset combining Elliptic blockchain transactions with synthetic IP/Port/Geo/ASN attributes.")

        if not tx_df.empty:
            st.dataframe(
                tx_df,
                use_container_width=True,
                hide_index=True,
                height=450,
            )
        else:
            st.warning("No transaction data loaded.")


if __name__ == "__main__":
    main()
