"""ChainTrace Summary Stat Cards Component."""

from __future__ import annotations

import pandas as pd
import streamlit as st

from ..config import HIGH_RISK_THRESHOLD, MEDIUM_RISK_THRESHOLD


def render_stat_cards(tx_df: pd.DataFrame, alerts_df: pd.DataFrame) -> None:
    """Render top summary metric cards for overall system status."""
    total_tx = len(tx_df)

    # Flagged entities stats
    flagged_df = alerts_df[alerts_df["risk_score"] >= MEDIUM_RISK_THRESHOLD]
    high_risk_df = alerts_df[alerts_df["risk_score"] >= HIGH_RISK_THRESHOLD]

    flagged_count = len(flagged_df)
    high_risk_count = len(high_risk_df)

    # Average confidence score of flagged entities
    if len(flagged_df) > 0:
        avg_confidence = flagged_df["risk_score"].mean() * 100
        avg_conf_str = f"{avg_confidence:.1f}%"
    else:
        avg_conf_str = "0.0%"

    # Distinct Louvain clusters detected among flagged entities
    if "cluster_id" in alerts_df.columns and len(flagged_df) > 0:
        distinct_clusters = flagged_df["cluster_id"].nunique()
    else:
        distinct_clusters = 0

    col1, col2, col3, col4 = st.columns(4)

    with col1:
        st.markdown(
            f"""
            <div class="ct-stat-card">
                <div class="ct-stat-label">Total Transactions</div>
                <div class="ct-stat-value">{total_tx:,}</div>
                <div class="ct-stat-subtext">Unified Elliptic + Network Stream</div>
            </div>
            """,
            unsafe_allow_html=True,
        )

    with col2:
        st.markdown(
            f"""
            <div class="ct-stat-card" style="border-top: 3px solid #ff1744;">
                <div class="ct-stat-label">Suspicious Entities Flagged</div>
                <div class="ct-stat-value" style="color: #ff1744;">{flagged_count:,}</div>
                <div class="ct-stat-subtext">
                    <span style="color: #ff1744; font-weight: 600;">{high_risk_count}</span> Critical (Score ≥ {HIGH_RISK_THRESHOLD:.2f})
                </div>
            </div>
            """,
            unsafe_allow_html=True,
        )

    with col3:
        st.markdown(
            f"""
            <div class="ct-stat-card" style="border-top: 3px solid #ff9100;">
                <div class="ct-stat-label">Avg ML Confidence</div>
                <div class="ct-stat-value" style="color: #ff9100;">{avg_conf_str}</div>
                <div class="ct-stat-subtext">Random + Isolation Forest Blend</div>
            </div>
            """,
            unsafe_allow_html=True,
        )

    with col4:
        st.markdown(
            f"""
            <div class="ct-stat-card" style="border-top: 3px solid #00e5ff;">
                <div class="ct-stat-label">Louvain Clusters Detected</div>
                <div class="ct-stat-value" style="color: #00e5ff;">{distinct_clusters}</div>
                <div class="ct-stat-subtext">Entity Community Subgraphs</div>
            </div>
            """,
            unsafe_allow_html=True,
        )
