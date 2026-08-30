"""ChainTrace Graph Visualization Component Slot.

Provides the Person D integration point for Pyvis-rendered graphs, while keeping a
clean demo fallback for the prototype when real graph output is not generated yet.
"""

from __future__ import annotations

import json
import os

import pandas as pd
import streamlit as st
import streamlit.components.v1 as components


def _risk_to_color(score: float) -> str:
    if score >= 0.8:
        return "#ef4444"
    if score >= 0.5:
        return "#f59e0b"
    return "#22c55e"


def _parse_address_list(value: object) -> list[str]:
    if isinstance(value, list):
        return [str(v).strip() for v in value if str(v).strip()]
    if isinstance(value, str):
        value = value.strip()
        if not value:
            return []
        try:
            parsed = json.loads(value)
            if isinstance(parsed, list):
                return [str(v).strip() for v in parsed if str(v).strip()]
        except (TypeError, ValueError):
            pass
        return [value]
    return []


def _build_graph_from_data(alerts_df: pd.DataFrame | None, tx_df: pd.DataFrame | None, selected_entity: str | None = None):
    nodes: list[dict] = []
    edges: list[tuple[str, str, str]] = []
    seen_nodes: set[str] = set()

    def add_node(node_id: str, node_type: str, risk_score: float, title: str, color: str | None = None):
        node_id = str(node_id)
        if not node_id or node_id in seen_nodes:
            return
        seen_nodes.add(node_id)
        nodes.append(
            {
                "id": node_id,
                "type": node_type,
                "risk": float(risk_score),
                "title": title,
                "color": color or _risk_to_color(float(risk_score)),
            }
        )

    # 1) Add flagged alert entities from the ML output
    if alerts_df is not None and not alerts_df.empty:
        for _, row in alerts_df.head(25).iterrows():
            node_id = str(row.get("node_id", "")).strip()
            if not node_id:
                continue
            node_type = str(row.get("node_type", "wallet")).strip().lower() or "wallet"
            risk_score = float(row.get("risk_score", 0.0) or 0.0)
            cluster_id = str(row.get("cluster_id", "Unclust"))
            reason = str(row.get("reason", "Flagged by graph+ML scoring"))
            add_node(node_id, node_type, risk_score, f"{cluster_id}\n{reason}", _risk_to_color(risk_score))

            # Add a cluster node and connect it to the main flagged entity for interpretation.
            if cluster_id:
                cluster_key = f"cluster::{cluster_id}"
                add_node(cluster_key, "cluster", risk_score * 0.9, f"Cluster {cluster_id}", "#60a5fa")
                edges.append((node_id, cluster_key, "same cluster"))

    # 2) Add transaction context nodes from the raw dataset and link them to flagged wallets.
    if tx_df is not None and not tx_df.empty:
        tx_sample = tx_df.head(20).copy()
        tx_id_set = set(str(v) for v in tx_sample["txid"].dropna().tolist() if str(v).strip())

        for _, row in tx_sample.iterrows():
            tx_id = str(row.get("txid", "")).strip()
            if tx_id:
                add_node(tx_id, "tx", 0.55, f"Transaction {tx_id}", "#00e5ff")

            # Link wallet addresses to tx nodes when the address appears in input/output lists.
            for field in ["input_addresses", "output_addresses"]:
                for addr in _parse_address_list(row.get(field)):
                    if not addr:
                        continue
                    add_node(addr, "wallet", 0.35, f"Wallet {addr}", "#8b5cf6")
                    if tx_id:
                        edges.append((addr, tx_id, "fund flow"))

        # Connect flagged wallet IDs to matching transactions when they appear in the tx stream.
        for _, row in tx_sample.iterrows():
            tx_id = str(row.get("txid", "")).strip()
            if not tx_id:
                continue
            related_wallets = set()
            for field in ["input_addresses", "output_addresses"]:
                related_wallets.update(_parse_address_list(row.get(field)))
            for wallet_id in sorted(related_wallets):
                if wallet_id in set(str(v) for v in alerts_df["node_id"].dropna().tolist() if str(v).strip()) if alerts_df is not None else set():
                    edges.append((wallet_id, tx_id, "linked transaction"))

    # 3) Keep the selection highlighted if the user has chosen a node.
    if selected_entity:
        selected_entity = str(selected_entity)

    return nodes, edges


def render_graph_section(
    selected_entity: str | None = None,
    alerts_df: pd.DataFrame | None = None,
    tx_df: pd.DataFrame | None = None,
    html_path: str = "outputs/graphs/cluster_graph.html",
) -> None:
    """Render the entity-transaction graph for the dashboard."""
    st.markdown("### 🕸️ Entity-Transaction Network Graph Analysis")

    if selected_entity:
        st.info(f"🎯 Currently Focusing Graph Node: `{selected_entity}`")
    else:
        st.caption("Select an entity from the Alert Table above or click nodes below to inspect link analysis.")

    if os.path.exists(html_path):
        try:
            with open(html_path, "r", encoding="utf-8") as f:
                html_content = f.read()
            components.html(html_content, height=700, scrolling=True)
            return
        except Exception as e:
            st.warning(f"Could not load local graph HTML file ({e}). Displaying fallback graph.")

    try:
        from pyvis.network import Network

        nodes, edges = _build_graph_from_data(alerts_df, tx_df, selected_entity)

        net = Network(height="700px", width="100%", bgcolor="#111827", font_color="#f8fafc", directed=True)
        net.barnes_hut()
        net.set_options(
            """
            {
              "physics": {
                "enabled": true,
                "barnesHut": {
                  "gravitationalConstant": -8000,
                  "springLength": 200,
                  "springConstant": 0.03
                }
              },
              "interaction": {
                "hover": true,
                "navigationButtons": true,
                "keyboard": true
              }
            }
            """
        )

        if not nodes:
            nodes = [
                {"id": "wallet_0003", "type": "wallet", "risk": 0.92, "title": "High-risk wallet", "color": "#ef4444"},
                {"id": "wallet_0015", "type": "wallet", "risk": 0.74, "title": "Suspicious intermediary", "color": "#f59e0b"},
                {"id": "tx_9012", "type": "tx", "risk": 0.66, "title": "Transaction node", "color": "#00e5ff"},
                {"id": "AS14061", "type": "asn", "risk": 0.82, "title": "Risky hosting provider", "color": "#ef4444"},
            ]
            edges = [("wallet_0003", "tx_9012", "fund flow"), ("wallet_0015", "tx_9012", "transaction"), ("wallet_0003", "AS14061", "risky ASN")]

        for node in nodes:
            node_id = str(node["id"])
            is_focus = bool(selected_entity and (selected_entity in node_id or node_id in str(selected_entity)))
            border_color = "#ffffff" if is_focus else str(node["color"])
            border_width = 4 if is_focus else 1
            size = 18 + (float(node["risk"]) * 22)
            label = node_id[:12] + "..." if len(node_id) > 12 else node_id
            title = f"{node['title']}\nRisk: {float(node['risk']):.2f}\nType: {node['type']}"

            net.add_node(
                node_id,
                label=label,
                title=title,
                color={"background": str(node["color"]), "border": border_color},
                borderWidth=border_width,
                size=size,
            )

        for src, dst, label in edges:
            if str(src) and str(dst):
                net.add_edge(str(src), str(dst), title=str(label), color="#94a3b8", width=2)

        html_code = net.generate_html()
        components.html(html_code, height=700, scrolling=True)

    except Exception as err:
        st.markdown(
            f"""
            <div style="background: #121824; border: 1px dashed #232f48; border-radius: 12px; padding: 1.5rem; text-align: center;">
                <h4 style="color: #00e5ff; margin-bottom: 0.5rem;">🕸️ Graph Slot Ready</h4>
                <p style="color: #94a3b8;">
                    PyVis graph embedding is available here for Person D.
                    If no real graph file exists yet, the dashboard stays in demo mode.
                </p>
                <code style="color: #ff9100;">{err}</code>
            </div>
            """,
            unsafe_allow_html=True,
        )
