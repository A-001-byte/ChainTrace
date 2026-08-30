"""Central paths and constants for the graph_ml module (Person B — Phase 2).

Keeping these in one place means the rest of the pipeline never hardcodes a path,
and swapping the data location (e.g. Colab, a teammate's machine) is a one-line change.
"""

from pathlib import Path

# Repo root = three levels up from this file (src/graph_ml/config.py -> repo root)
REPO_ROOT = Path(__file__).resolve().parents[2]

DATA_RAW_DIR = REPO_ROOT / "data" / "raw"
ELLIPTIC_DIR = DATA_RAW_DIR / "elliptic"
ELLIPTIC_PP_DIR = DATA_RAW_DIR / "elliptic_pp"
PROCESSED_DIR = REPO_ROOT / "data" / "processed"

OUTPUTS_DIR = REPO_ROOT / "outputs"
MODELS_DIR = OUTPUTS_DIR / "models"
ALERTS_DIR = OUTPUTS_DIR / "alerts"
GRAPHS_DIR = OUTPUTS_DIR / "graphs"

# Elliptic (Kaggle) raw filenames
ELLIPTIC_FEATURES_CSV = ELLIPTIC_DIR / "elliptic_txs_features.csv"
ELLIPTIC_CLASSES_CSV = ELLIPTIC_DIR / "elliptic_txs_classes.csv"
ELLIPTIC_EDGELIST_CSV = ELLIPTIC_DIR / "elliptic_txs_edgelist.csv"

# Elliptic++ (Actors Dataset) raw filenames. Verified against the real Google Drive download
# (the GitHub zip only ships Git-LFS pointer stubs — LFS quota was exhausted as of this
# build). Real quirks handled in data_loader.load_elliptic_pp_wallets(): "Time step" and
# "num_txs_as receiver" have spaces in their headers, class labels are int 1/2/3 (not text),
# and the edgelists use input_address/output_address rather than a shared "address" column.
WALLETS_FEATURES_CSV = ELLIPTIC_PP_DIR / "wallets_features.csv"
WALLETS_CLASSES_CSV = ELLIPTIC_PP_DIR / "wallets_classes.csv"
ADDR_TX_EDGELIST_CSV = ELLIPTIC_PP_DIR / "AddrTx_edgelist.csv"
TX_ADDR_EDGELIST_CSV = ELLIPTIC_PP_DIR / "TxAddr_edgelist.csv"
ADDR_ADDR_EDGELIST_CSV = ELLIPTIC_PP_DIR / "AddrAddr_edgelist.csv"  # optional, not required for Phase 2

# Elliptic raw class labels -> normalized labels used everywhere downstream
CLASS_LABEL_MAP = {
    "1": "illicit",
    "2": "licit",
    "unknown": "unknown",
    1: "illicit",
    2: "licit",
}

RANDOM_STATE = 42

# Isolation Forest's expected proportion of anomalies in the data (tune per dataset size)
ANOMALY_CONTAMINATION = 0.05

# Weights for combining classifier confidence + anomaly score into one risk score (Section 7.2.5)
RISK_WEIGHT_CLASSIFIER = 0.6
RISK_WEIGHT_ANOMALY = 0.4

TOP_N_ALERTS = 50
TOP_K_FEATURES_FOR_EXPLANATION = 3
