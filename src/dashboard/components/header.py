"""ChainTrace Header Component."""

from __future__ import annotations

from datetime import datetime, timezone

import streamlit as st


def render_header(data_source_label: str = "Synthetic Mock Data Mode", warnings: list[str] | None = None) -> None:
    """Render top application banner with status indicators."""
    current_time = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M:%S UTC")

    if "Live" in data_source_label:
        source_badge = f'<span class="ct-badge ct-badge-green">● {data_source_label}</span>'
    elif "Partial" in data_source_label:
        source_badge = f'<span class="ct-badge ct-badge-amber">▲ {data_source_label}</span>'
    else:
        source_badge = f'<span class="ct-badge ct-badge-cyan">◆ {data_source_label}</span>'

    offline_badge = '<span class="ct-badge ct-badge-green">🔒 100% Offline Engine</span>'

    html = f"""
    <div class="ct-header-banner">
        <div style="display: flex; justify-content: space-between; align-items: flex-start; flex-wrap: wrap; gap: 1rem;">
            <div>
                <h1 class="ct-header-title">
                    <span style="color: #00e5ff;">Chain</span>Trace
                    <span style="font-size: 0.9rem; font-weight: 500; color: #94a3b8; margin-left: 0.5rem; background: rgba(255,255,255,0.06); padding: 0.2rem 0.6rem; border-radius: 4px;">SIH26146 Prototype</span>
                </h1>
                <p class="ct-header-subtitle">
                    Offline Bitcoin Forensic Lead Detection • Network Layer & Blockchain Fusion Engine
                </p>
            </div>
            <div style="display: flex; flex-direction: column; align-items: flex-end; gap: 0.4rem;">
                <div style="display: flex; gap: 0.5rem; flex-wrap: wrap;">
                    {source_badge}
                    {offline_badge}
                </div>
                <div style="font-size: 0.75rem; color: #64748b; font-family: monospace;">
                    System Time: {current_time}
                </div>
            </div>
        </div>
    </div>
    """
    st.markdown(html, unsafe_allow_html=True)

    # Display warnings banner if file parsing issues occurred
    if warnings:
        for warn in warnings:
            st.warning(f"⚠️ {warn}")
