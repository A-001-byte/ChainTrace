"""Paths and constants for the data_pipeline module (Person A — Phase 1).

Reuses graph_ml's path constants (REPO_ROOT, DATA_RAW_DIR, ELLIPTIC*, WALLETS*,
CLASS_LABEL_MAP, RANDOM_STATE) rather than redefining them, so both packages stay in sync
if the repo layout ever changes.
"""

from datetime import datetime

from src.graph_ml import config as ml_config

REPO_ROOT = ml_config.REPO_ROOT
DATA_RAW_DIR = ml_config.DATA_RAW_DIR
PROCESSED_DIR = ml_config.PROCESSED_DIR
RANDOM_STATE = ml_config.RANDOM_STATE
CLASS_LABEL_MAP = ml_config.CLASS_LABEL_MAP

GEOLITE_DIR = DATA_RAW_DIR / "geolite2"
GEOLITE_CITY_BLOCKS_CSV = GEOLITE_DIR / "GeoLite2-City-Blocks-IPv4.csv"
GEOLITE_CITY_LOCATIONS_CSV = GEOLITE_DIR / "GeoLite2-City-Locations-en.csv"
GEOLITE_ASN_BLOCKS_CSV = GEOLITE_DIR / "GeoLite2-ASN-Blocks-IPv4.csv"

UNIFIED_DATASET_CSV = PROCESSED_DIR / "unified_dataset.csv"
WALLET_DATASET_CSV = PROCESSED_DIR / "wallet_dataset.csv"

# ASNs to weight illicit-labeled transactions toward (hosting / VPN-heavy / Tor-friendly).
# Verified present with real announced CIDR blocks in the team's GeoLite2-ASN-Blocks-IPv4.csv
# (5997/20/460/190/167/604 blocks respectively) — placeholder list from the task brief,
# confirmed with the team to use as-is (see plan open item #2).
RISKY_ASNS = [16509, 8452, 6939, 15169, 14061, 16276]
# Named for the console spot-check summary only.
RISKY_ASN_NAMES = {
    16509: "AWS",
    8452: "TE Data",
    6939: "Hurricane Electric",
    15169: "Google Cloud",
    14061: "DigitalOcean",
    16276: "OVH",
}

# Large residential/consumer ISPs across several regions, so licit-labeled synthetic IPs
# aren't all US-centric. Verified present with real CIDR blocks in the same file.
RESIDENTIAL_ASNS = [7922, 7018, 701, 3320, 4837, 9808, 3269, 12322]
RESIDENTIAL_ASN_NAMES = {
    7922: "Comcast",
    7018: "AT&T",
    701: "Verizon",
    3320: "Deutsche Telekom",
    4837: "China Unicom",
    9808: "China Mobile",
    3269: "Telecom Italia",
    12322: "Free SAS",
}

# Bitcoin's default P2P port dominates; the rest is a mix of testnet/HTTPS/SSH/generic.
PORT_MAIN = 8333
PORT_MAIN_PROB = 0.70
PORT_ALTERNATIVES = [18333, 443, 22, 9999]

# No dataset here carries a real Bitcoin script type, so it's generated with a documented,
# illustrative real-world-ish distribution (P2PKH still dominant on-chain historically).
SCRIPT_TYPES = ["P2PKH", "P2SH", "P2WPKH", "P2WSH"]
SCRIPT_TYPE_WEIGHTS = [0.45, 0.25, 0.20, 0.10]

# Elliptic time steps are ~2-week windows; anchor is arbitrary since the paper does not
# publish real calendar dates (matches the anchor already used in scripts/data_pipeline.py).
ANCHOR_DATE = datetime(2015, 1, 1)
TIME_STEP_DAYS = 14

# Task schema requires numeric labels: 0=licit, 1=illicit, -1=unknown (graph_ml's internal
# string labels are illicit/licit/unknown — converted only at final export).
LABEL_TO_NUMERIC = {"illicit": 1, "licit": 0, "unknown": -1}

# Standard UTC hour offsets for major ISO country codes in GeoLite2 CSV dataset
COUNTRY_UTC_OFFSET = {
    "US": -5,   # EST / central standard fallback
    "CA": -5,
    "GB": 0,
    "FR": 1,
    "DE": 1,
    "IT": 1,
    "NL": 1,
    "RO": 2,
    "EG": 2,
    "RU": 3,
    "CN": 8,
    "SG": 8,
    "JP": 9,
    "AU": 10,
}

