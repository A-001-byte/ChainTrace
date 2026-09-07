"""ChainTrace Ranked Alert Table & Entity Drill-down Component."""

from __future__ import annotations

import pandas as pd
import streamlit as st

from ..config import HIGH_RISK_THRESHOLD, MEDIUM_RISK_THRESHOLD


def _strip_node_id_prefix(entity_id: str) -> str:
    """graph_ml node ids are "wallet_<address>" or "tx_<txid>" (see graph_builder.py's
    _wallet_node_id/_tx_node_id), but unified_dataset.csv's own txid/input_addresses/
    output_addresses columns hold the bare address/txid with no such prefix. Searching for
    the full node id as a substring therefore never matches anything against real pipeline
    output — confirmed directly against the real data, not assumed — so this was a
    pre-existing dead lookup (silently "no linked transactions found" for every real
    entity) in both the original inline version of this code and the first extracted copy
    of this function, not something introduced by this fix.
    """
    for prefix in ("wallet_", "tx_"):
        if entity_id.startswith(prefix):
            return entity_id[len(prefix):]
    return entity_id


def find_linked_transactions(tx_df: pd.DataFrame, entity_id: str) -> pd.DataFrame:
    """Find transactions in tx_df (unified_dataset.csv) that reference this entity —
    either as the txid itself, or as one of its input/output addresses.

    Pure pandas, no Streamlit dependency — shared by render_entity_drilldown() (Streamlit)
    and src/webapp's /api/entity/<node_id> endpoint, so both surfaces show the identical
    "linked blockchain transactions" list from identical logic.

    Note: substring match (not exact/quoted), matching the original inline behavior this
    was extracted from — a wallet address that happens to be a substring of another
    address could theoretically over-match, but that's pre-existing behavior, not
    something this extraction changes.
    """
    needle = _strip_node_id_prefix(entity_id)
    return tx_df[
        tx_df["txid"].astype(str).str.contains(needle, case=False, na=False, regex=False)
        | tx_df["input_addresses"].astype(str).str.contains(needle, case=False, na=False, regex=False)
        | tx_df["output_addresses"].astype(str).str.contains(needle, case=False, na=False, regex=False)
    ]


def find_linked_transactions_bulk(tx_df: pd.DataFrame, entity_ids: list[str]) -> dict[str, pd.DataFrame]:
    """Same matching semantics as find_linked_transactions(), for many entities in one call.

    A single Streamlit drill-down click only ever needs one entity's linked transactions,
    so find_linked_transactions()'s per-call full-table scan is fine there. But looking up
    tens of entities that way (e.g. src/webapp's geo-overlay, which needs every flagged
    alert's real geo) means tens of full 200k+-row scans across 3 string columns.

    First attempt at this used one combined-regex alternation (all needed addresses OR'd
    into a single pattern) to cut it to 3 scans total — measured at 36s against the real
    ~204k-row dataset, i.e. barely faster than doing it 50 separate times. Root cause: a
    50-way regex alternation makes Python's `re` engine try every alternative at every
    string position (no automatic trie/Aho-Corasick optimization), so it does roughly the
    same work as 50 separate searches, just inside one call. Literal (non-regex) substring
    search is what's actually fast in pandas — so this does per-address literal
    str.contains(regex=False) calls instead, converting each string column to str only
    once up front rather than once per lookup.
    """
    if not entity_ids:
        return {}

    txid_col = tx_df["txid"].astype(str)
    input_col = tx_df["input_addresses"].astype(str)
    output_col = tx_df["output_addresses"].astype(str)

    results = {}
    for entity_id in entity_ids:
        needle = _strip_node_id_prefix(str(entity_id))
        mask = (
            txid_col.str.contains(needle, case=False, na=False, regex=False)
            | input_col.str.contains(needle, case=False, na=False, regex=False)
            | output_col.str.contains(needle, case=False, na=False, regex=False)
        )
        results[entity_id] = tx_df[mask]
    return results


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

    # intent_label/intent_confidence come from the optional intent_classifier post-process
    # step (src/graph_ml/intent_classifier.py) — older ranked_alerts.csv files won't have
    # them, so only show the column when it's actually present rather than crashing or
    # showing a column of blanks.
    has_intent = "intent_label" in filtered_df.columns

    # Table Display Prep
    display_cols = [
        "node_id",
        "node_type",
        "risk_score",
        "classifier_confidence",
        "anomaly_score",
        "cluster_id",
        "reason",
        "geo_country",
    ]
    if has_intent:
        display_cols.insert(6, "intent_label")  # next to "reason", same explainability spirit
    display_df = filtered_df[display_cols].copy()

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
    if has_intent:
        column_config["intent_label"] = st.column_config.TextColumn(
            "Intent Pattern",
            help=(
                "Rule-based structural pattern match (fan-in/out shape, timing burst, hop "
                "depth) against named crime-archetype signatures — NOT a classifier trained "
                "on crime-type labels (no such ground truth exists in Elliptic/Elliptic++)."
            ),
            width="medium",
        )

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

        if "intent_label" in row.index and pd.notna(row.get("intent_label")):
            st.markdown("---")
            st.markdown(
                f"**Intent pattern:** `{row['intent_label']}` "
                f"(confidence {float(row.get('intent_confidence', 0)):.2f})"
            )
            st.caption(
                "Rule-based structural match, not a trained crime-type classifier — "
                "Elliptic/Elliptic++ has no ground-truth crime-type labels."
            )
            explanation = str(row.get("intent_explanation", "")).strip()
            if explanation:
                st.markdown(f"*{explanation}*")

    # Find associated transactions in tx_df
    st.markdown("#### 🔗 Linked Blockchain Transactions")
    target_addr = str(row["node_id"])
    matching_txs = find_linked_transactions(tx_df, target_addr)

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

    # 💥 Kick Down Doors USP — High-Leverage Node Analysis (Person B / Module 3 USP)
    with st.expander("💥 Kick Down Doors — High-Leverage Disruption Analysis", expanded=False):
        st.caption("Identifies high-leverage target nodes whose removal maximally disrupts money-flow pathways around this entity.")
        try:
            import networkx as nx
            from src.graph_ml.clustering import kick_down_doors

            # Construct local neighborhood graph around entity and matching transactions
            sub_g = nx.Graph()
            sub_g.add_node(target_addr, label=str(row.get("label", "unknown")), cluster=row.get("cluster_id"))
            if not matching_txs.empty:
                for _, t_row in matching_txs.head(15).iterrows():
                    tx_node = f"tx_{t_row['txid']}"
                    sub_g.add_node(tx_node, label=str(t_row.get("label", "unknown")), node_type="tx")
                    sub_g.add_edge(target_addr, tx_node)
                    # Add neighboring input/output addresses
                    def _parse_addr_list(val: object) -> list[str]:
                        if isinstance(val, list):
                            return [str(v).strip() for v in val if str(v).strip()]
                        if isinstance(val, str) and val.strip():
                            s = val.strip()
                            if s.startswith("[") and s.endswith("]"):
                                try:
                                    import json
                                    parsed = json.loads(s)
                                    if isinstance(parsed, list):
                                        return [str(v).strip() for v in parsed if str(v).strip()]
                                except Exception:
                                    pass
                            return [s]
                        return []

                    for fld in ["input_addresses", "output_addresses"]:
                        for addr in _parse_addr_list(t_row.get(fld)):
                            if addr and addr != target_addr:
                                w_node = f"wallet_{addr}"
                                sub_g.add_node(w_node, label="unknown", node_type="wallet")
                                sub_g.add_edge(tx_node, w_node)

            target_nodes = kick_down_doors(sub_g, [target_addr], top_n=5)
            if target_nodes:
                kdd_df = pd.DataFrame(target_nodes)
                st.dataframe(
                    kdd_df[["node_id", "node_type", "impact_score", "betweenness", "is_articulation_point", "reason"]],
                    use_container_width=True,
                    hide_index=True,
                )
            else:
                st.info("No structural articulation points found in immediate 1-hop neighborhood.")
        except Exception as e:
            st.warning(f"Kick Down Doors analysis unavailable: {e}")

