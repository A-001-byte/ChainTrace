"""ChainTrace Ranked Alert Table & Entity Drill-down Component."""

from __future__ import annotations

import pandas as pd
import streamlit as st

from ..config import HIGH_RISK_THRESHOLD, MEDIUM_RISK_THRESHOLD


def render_alerts_table(alerts_df: pd.DataFrame, tx_df: pd.DataFrame) -> str | None:
    """Render sortable, filterable alert table with row selection drill-down.

    Returns:
        Selected entity ID string if a row is selected, otherwise None.
    """
    st.markdown("### 🚨 Ranked Suspicious Leads & Entities")

    if alerts_df.empty:
        st.info("No alert records available to display.")
        return None

    # Filter Toolbar Controls
    with st.expander("🔍 Filter & Search Leads", expanded=True):
        col1, col2, col3, col4 = st.columns([1.2, 1, 1, 1])

        with col1:
            min_score = st.slider(
                "Min Risk Score",
                min_value=0.0,
                max_value=1.0,
                value=0.50,
                step=0.05,
                help="Filter entities with blended ML risk score above threshold",
            )

        with col2:
            all_clusters = sorted(list(set(alerts_df["cluster_id"].dropna().astype(str))))
            selected_clusters = st.multiselect("Filter Cluster", options=all_clusters, default=[])

        with col3:
            all_countries = sorted(list(set(alerts_df["geo_country"].dropna().astype(str))))
            selected_countries = st.multiselect("Filter Country", options=all_countries, default=[])

        with col4:
            search_query = st.text_input("Search ID / Keyword", placeholder="Address or txid...")

    # Apply Filters
    filtered_df = alerts_df.copy()

    filtered_df = filtered_df[filtered_df["risk_score"] >= min_score]

    if selected_clusters:
        filtered_df = filtered_df[filtered_df["cluster_id"].astype(str).isin(selected_clusters)]

    if selected_countries:
        filtered_df = filtered_df[filtered_df["geo_country"].astype(str).isin(selected_countries)]

    if search_query:
        query_lower = search_query.strip().lower()
        mask = (
            filtered_df["node_id"].astype(str).str.lower().str.contains(query_lower)
            | filtered_df["reason"].astype(str).str.lower().str.contains(query_lower)
            | filtered_df["asn"].astype(str).str.lower().str.contains(query_lower)
        )
        filtered_df = filtered_df[mask]

    st.caption(f"Showing **{len(filtered_df)}** of **{len(alerts_df)}** flagged leads")

    if filtered_df.empty:
        st.warning("No leads match the selected filter criteria.")
        return None

    # Table Display Prep
    display_df = filtered_df[
        [
            "node_id",
            "node_type",
            "risk_score",
            "classifier_confidence",
            "anomaly_score",
            "cluster_id",
            "reason",
            "geo_country",
        ]
    ].copy()

    # Column formatting for st.dataframe
    column_config = {
        "node_id": st.column_config.TextColumn("Entity / Wallet ID", help="Bitcoin wallet address or transaction ID", width="medium"),
        "node_type": st.column_config.TextColumn("Type", width="small"),
        "risk_score": st.column_config.ProgressColumn(
            "Risk Score",
            help="Blended score (Random Forest + Isolation Forest + Louvain)",
            format="%.4f",
            min_value=0.0,
            max_value=1.0,
            width="small",
        ),
        "classifier_confidence": st.column_config.NumberColumn("RF Conf.", format="%.3f", width="small"),
        "anomaly_score": st.column_config.NumberColumn("Anom. Score", format="%.3f", width="small"),
        "cluster_id": st.column_config.TextColumn("Cluster", width="small"),
        "reason": st.column_config.TextColumn("Why Flagged (Feature Importances)", width="large"),
        "geo_country": st.column_config.TextColumn("Country", width="small"),
    }

    # Selection mode
    event = st.dataframe(
        display_df,
        column_config=column_config,
        use_container_width=True,
        hide_index=True,
        on_select="rerun",
        selection_mode="single-row",
        height=320,
    )

    selected_entity_id = None

    # Check dataframe selection
    selected_rows = event.selection.rows if hasattr(event, "selection") else []
    if selected_rows:
        selected_index = selected_rows[0]
        selected_entity_id = str(display_df.iloc[selected_index]["node_id"])
        st.session_state["selected_entity"] = selected_entity_id

    # Fallback selectbox if user prefers explicit dropdown
    col_sel, col_btn = st.columns([3, 1])
    with col_sel:
        entity_options = ["(Select a row from table above, or pick from dropdown)"] + list(filtered_df["node_id"].astype(str))
        default_idx = 0
        if st.session_state.get("selected_entity") in entity_options:
            default_idx = entity_options.index(st.session_state["selected_entity"])
        
        picked = st.selectbox("Inspect Specific Entity Lead", options=entity_options, index=default_idx)
        if picked and picked != "(Select a row from table above, or pick from dropdown)":
            selected_entity_id = picked
            st.session_state["selected_entity"] = selected_entity_id

    # Render Entity Detail Drill-Down Panel if selected
    if selected_entity_id:
        render_entity_drilldown(selected_entity_id, alerts_df, tx_df)

    return selected_entity_id


def render_entity_drilldown(entity_id: str, alerts_df: pd.DataFrame, tx_df: pd.DataFrame) -> None:
    """Render detailed deep-dive card for a single selected wallet/transaction entity."""
    entity_row = alerts_df[alerts_df["node_id"].astype(str) == str(entity_id)]

    if entity_row.empty:
        st.error(f"Entity details for `{entity_id}` not found.")
        return

    row = entity_row.iloc[0]
    score = float(row.get("risk_score", 0.0))

    if score >= HIGH_RISK_THRESHOLD:
        badge_color = "#ff1744"
        risk_label = "HIGH RISK / CRITICAL ILLICIT"
    elif score >= MEDIUM_RISK_THRESHOLD:
        badge_color = "#ff9100"
        risk_label = "MEDIUM RISK / SUSPICIOUS"
    else:
        badge_color = "#00e676"
        risk_label = "LOW RISK / MONITORING"

    st.markdown("---")
    st.markdown(
        f"""
        <div style="background: #121824; border: 1px solid #232f48; border-left: 5px solid {badge_color}; border-radius: 8px; padding: 1.2rem; margin-top: 0.5rem;">
            <div style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 0.5rem;">
                <div>
                    <span style="font-size: 0.75rem; font-weight: 600; text-transform: uppercase; color: #94a3b8;">Entity Forensic Record</span>
                    <h3 style="margin: 0.2rem 0; font-family: monospace; color: #00e5ff;">{row['node_id']}</h3>
                </div>
                <div style="background: rgba(0,0,0,0.3); padding: 0.4rem 0.9rem; border-radius: 20px; border: 1px solid {badge_color};">
                    <span style="font-weight: 700; color: {badge_color}; font-size: 0.85rem;">● {risk_label} ({score * 100:.1f}%)</span>
                </div>
            </div>
        </div>
        """,
        unsafe_allow_html=True,
    )

    col1, col2, col3 = st.columns(3)

    with col1:
        st.markdown("#### 📊 Risk Breakdown")
        st.write(f"**Node Type:** `{row.get('node_type', 'wallet')}`")
        st.write(f"**Random Forest Confidence:** `{float(row.get('classifier_confidence', 0)):.4f}`")
        st.write(f"**Isolation Forest Anomaly:** `{float(row.get('anomaly_score', 0)):.4f}`")
        st.write(f"**Louvain Community:** `{row.get('cluster_id', 'N/A')}`")

    with col2:
        st.markdown("#### 🌐 Network Metadata")
        st.write(f"**Geo Country:** {row.get('geo_country', 'Unknown')}")
        st.write(f"**ASN Provider:** `{row.get('asn', 'Unknown')}`")
        st.write(f"**Ground Truth Label:** `{row.get('label', 'unknown')}`")

    with col3:
        st.markdown("#### 🎯 Explainability Logic")
        reasons = str(row.get("reason", "")).split(";")
        for r in reasons:
            if r.strip():
                st.markdown(f"- ⚠️ {r.strip()}")

    # Find associated transactions in tx_df
    st.markdown("#### 🔗 Linked Blockchain Transactions")
    target_addr = str(row["node_id"])

    # Search for transactions containing address or matching txid
    matching_txs = tx_df[
        tx_df["txid"].astype(str).str.contains(target_addr, case=False, na=False)
        | tx_df["input_addresses"].astype(str).str.contains(target_addr, case=False, na=False)
        | tx_df["output_addresses"].astype(str).str.contains(target_addr, case=False, na=False)
    ]

    if not matching_txs.empty:
        st.dataframe(
            matching_txs[
                [
                    "txid",
                    "timestamp",
                    "src_ip",
                    "dst_ip",
                    "script_type",
                    "fee",
                    "geo_country",
                    "asn",
                ]
            ].head(5),
            use_container_width=True,
            hide_index=True,
        )
    else:
        st.info("No direct 1:1 transaction records found in current transaction slice.")
