"""ChainTrace Geo/ASN Network Overlay Component."""

from __future__ import annotations

import pandas as pd
import streamlit as st

from ..config import MEDIUM_RISK_THRESHOLD


def render_geo_overlay(alerts_df: pd.DataFrame, tx_df: pd.DataFrame) -> None:
    """Render geographic country & ASN distribution analysis overlay."""
    st.markdown("### 🌐 Network-Layer Geo & ASN Infrastructure Analysis")
    st.caption("Cross-correlation of flagged suspicious entities by geographic jurisdiction and hosting provider (ASN).")

    if alerts_df.empty:
        st.info("No alert data available for geographic overlay.")
        return

    # Filter to suspicious/flagged entities
    flagged = alerts_df[alerts_df["risk_score"] >= MEDIUM_RISK_THRESHOLD].copy()
    if flagged.empty:
        flagged = alerts_df.copy()

    tab1, tab2 = st.tabs(["🌍 Country Distribution", "🏢 ASN Hosting Provider Distribution"])

    with tab1:
        col_left, col_right = st.columns([1, 1])

        with col_left:
            st.markdown("#### Top Jurisdictions for Flagged Entities")
            geo_counts = (
                flagged.groupby("geo_country")
                .agg(
                    flagged_count=("node_id", "count"),
                    avg_risk_score=("risk_score", "mean"),
                    max_risk_score=("risk_score", "max"),
                )
                .reset_index()
                .sort_values("flagged_count", ascending=False)
            )

            geo_counts["avg_risk_score"] = geo_counts["avg_risk_score"].apply(lambda v: f"{v*100:.1f}%")
            geo_counts["max_risk_score"] = geo_counts["max_risk_score"].apply(lambda v: f"{v*100:.1f}%")

            st.dataframe(
                geo_counts,
                column_config={
                    "geo_country": st.column_config.TextColumn("Country Jurisdiction"),
                    "flagged_count": st.column_config.NumberColumn("Flagged Count"),
                    "avg_risk_score": st.column_config.TextColumn("Avg Risk Score"),
                    "max_risk_score": st.column_config.TextColumn("Peak Risk"),
                },
                use_container_width=True,
                hide_index=True,
            )

        with col_right:
            st.markdown("#### Geographic Lead Concentration")
            if not geo_counts.empty:
                chart_data = geo_counts.set_index("geo_country")[["flagged_count"]]
                st.bar_chart(chart_data, color="#00e5ff")

    with tab2:
        col_left, col_right = st.columns([1, 1])

        with col_left:
            st.markdown("#### Top Autonomous Systems (ASNs)")
            asn_counts = (
                flagged.groupby("asn")
                .agg(
                    flagged_count=("node_id", "count"),
                    avg_risk_score=("risk_score", "mean"),
                )
                .reset_index()
                .sort_values("flagged_count", ascending=False)
            )

            asn_counts["avg_risk_score"] = asn_counts["avg_risk_score"].apply(lambda v: f"{v*100:.1f}%")

            st.dataframe(
                asn_counts,
                column_config={
                    "asn": st.column_config.TextColumn("Autonomous System / ISP"),
                    "flagged_count": st.column_config.NumberColumn("Flagged Entities"),
                    "avg_risk_score": st.column_config.TextColumn("Avg Risk Score"),
                },
                use_container_width=True,
                hide_index=True,
            )

        with col_right:
            st.markdown("#### ASN Concentration Chart")
            if not asn_counts.empty:
                top_asn = asn_counts.head(8).set_index("asn")[["flagged_count"]]
                st.bar_chart(top_asn, color="#ff9100")
