"""ChainTrace Visual Configuration & CSS Styling.

Defines dark cyber-forensics design system tokens, color palettes, custom UI components,
and Streamlit layout setup for high-impact demo presentation.
"""

from __future__ import annotations

import streamlit as st

# Color Palette Tokens
BG_MAIN = "#0b0e14"
BG_CARD = "#121824"
BG_CARD_HOVER = "#1a2336"
BORDER_COLOR = "#232f48"
ACCENT_BLUE = "#00b0ff"
ACCENT_CYAN = "#00e5ff"
ACCENT_PURPLE = "#7c4dff"
SUCCESS_GREEN = "#00e676"
WARNING_AMBER = "#ff9100"
DANGER_RED = "#ff1744"
TEXT_PRIMARY = "#f0f4f8"
TEXT_SECONDARY = "#94a3b8"
TEXT_MUTED = "#64748b"

# Risk Threshold Constants
HIGH_RISK_THRESHOLD = 0.80
MEDIUM_RISK_THRESHOLD = 0.60


def set_page_config() -> None:
    """Initialize Streamlit page settings."""
    st.set_page_config(
        page_title="ChainTrace — Forensic Lead Detection",
        page_icon="🔍",
        layout="wide",
        initial_sidebar_state="expanded",
    )


def get_custom_css() -> str:
    """Return custom CSS for cyber-forensic dark dashboard aesthetic."""
    return f"""
    <style>
    @import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&family=JetBrains+Mono:wght@400;500;600&display=swap');

    /* Global Overrides */
    html, body, [class*="css"] {{
        font-family: 'Inter', sans-serif;
        color: {TEXT_PRIMARY};
    }}

    .main .block-container {{
        padding-top: 1.5rem;
        padding-bottom: 2rem;
        padding-left: 2rem;
        padding-right: 2rem;
        max-width: 100%;
    }}

    /* Header Banner */
    .ct-header-banner {{
        background: linear-gradient(135deg, #0e1526 0%, #151d33 50%, #192542 100%);
        border: 1px solid {BORDER_COLOR};
        border-left: 4px solid {ACCENT_CYAN};
        border-radius: 10px;
        padding: 1.25rem 1.75rem;
        margin-bottom: 1.5rem;
        box-shadow: 0 4px 20px rgba(0, 0, 0, 0.4);
    }}

    .ct-header-title {{
        font-size: 1.8rem;
        font-weight: 700;
        letter-spacing: -0.02em;
        color: #ffffff;
        margin: 0;
        display: flex;
        align-items: center;
        gap: 0.6rem;
    }}

    .ct-header-subtitle {{
        font-size: 0.92rem;
        color: {TEXT_SECONDARY};
        margin-top: 0.35rem;
        margin-bottom: 0;
    }}

    /* Status Badges */
    .ct-badge {{
        display: inline-block;
        padding: 0.25rem 0.6rem;
        border-radius: 20px;
        font-size: 0.75rem;
        font-weight: 600;
        text-transform: uppercase;
        letter-spacing: 0.05em;
    }}

    .ct-badge-green {{
        background: rgba(0, 230, 118, 0.15);
        color: {SUCCESS_GREEN};
        border: 1px solid rgba(0, 230, 118, 0.3);
    }}

    .ct-badge-cyan {{
        background: rgba(0, 229, 255, 0.15);
        color: {ACCENT_CYAN};
        border: 1px solid rgba(0, 229, 255, 0.3);
    }}

    .ct-badge-red {{
        background: rgba(255, 23, 68, 0.15);
        color: {DANGER_RED};
        border: 1px solid rgba(255, 23, 68, 0.3);
    }}

    .ct-badge-amber {{
        background: rgba(255, 145, 0, 0.15);
        color: {WARNING_AMBER};
        border: 1px solid rgba(255, 145, 0, 0.3);
    }}

    /* Stat Cards */
    .ct-stat-card {{
        background: {BG_CARD};
        border: 1px solid {BORDER_COLOR};
        border-radius: 10px;
        padding: 1.1rem 1.25rem;
        transition: all 0.2s ease-in-out;
        box-shadow: 0 4px 12px rgba(0, 0, 0, 0.25);
    }}

    .ct-stat-card:hover {{
        border-color: {ACCENT_BLUE};
        background: {BG_CARD_HOVER};
        transform: translateY(-2px);
    }}

    .ct-stat-label {{
        font-size: 0.8rem;
        font-weight: 600;
        text-transform: uppercase;
        letter-spacing: 0.06em;
        color: {TEXT_SECONDARY};
        margin-bottom: 0.4rem;
    }}

    .ct-stat-value {{
        font-size: 1.85rem;
        font-weight: 700;
        color: #ffffff;
        font-family: 'JetBrains Mono', monospace;
        line-height: 1.2;
    }}

    .ct-stat-subtext {{
        font-size: 0.78rem;
        color: {TEXT_MUTED};
        margin-top: 0.4rem;
    }}

    /* Code & Address formatting */
    .ct-code {{
        font-family: 'JetBrains Mono', monospace;
        font-size: 0.85rem;
        background: rgba(0, 0, 0, 0.3);
        padding: 0.2rem 0.4rem;
        border-radius: 4px;
        border: 1px solid {BORDER_COLOR};
        color: {ACCENT_CYAN};
    }}

    /* Sidebar Tweaks */
    section[data-testid="stSidebar"] {{
        background-color: #0c111a;
        border-right: 1px solid {BORDER_COLOR};
    }}

    /* Hide standard footer for clean video demo */
    footer {{visibility: hidden;}}
    #MainMenu {{visibility: hidden;}}
    </style>
    """


def apply_theme() -> None:
    """Inject custom CSS stylesheet into the current Streamlit app page."""
    st.markdown(get_custom_css(), unsafe_allow_html=True)
