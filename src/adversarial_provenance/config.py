"""Parameters and the honesty contract for the Adversarial Provenance Layer.

This is the `params.yaml` of the blueprint, expressed as a Python module so it stays
importable without adding a YAML config layer the rest of this repo doesn't use.

NOTHING in this module is a demo number. Every weight here is a declared prior that
shapes the computation; every *result* is computed from Elliptic++ rows at run time.
"""

from __future__ import annotations

from pathlib import Path

# --- Paths -----------------------------------------------------------------------
REPO_ROOT = Path(__file__).resolve().parents[2]

RAW_DIR = REPO_ROOT / "data" / "raw" / "elliptic_pp"
ADDRTX_CSV = RAW_DIR / "AddrTx_edgelist.csv"          # columns: input_address, txId
TXADDR_CSV = RAW_DIR / "TxAddr_edgelist.csv"          # columns: txId, output_address
WALLETS_CLASSES_CSV = RAW_DIR / "wallets_classes.csv"  # columns: address, class
TXS_FEATURES_CSV = RAW_DIR / "txs_features.csv"        # columns: txId, "Time step", ...

OUTPUT_DIR = REPO_ROOT / "data" / "processed" / "adversarial_provenance"
AGENCY_PARQUET = OUTPUT_DIR / "agency.parquet"
TAINT_PARQUET = OUTPUT_DIR / "taint_scores.parquet"
MANIFEST_JSON = OUTPUT_DIR / "_manifest.json"
HEADLINE_STATS_JSON = OUTPUT_DIR / "headline_stats.json"

# Contract B output of the graph_ml pipeline. Read-only, never rewritten by this module.
RANKED_ALERTS_CSV = REPO_ROOT / "outputs" / "alerts" / "ranked_alerts.csv"

# --- Elliptic class semantics ------------------------------------------------------
CLASS_ILLICIT = 1
CLASS_LICIT = 2
CLASS_UNKNOWN = 3

# --- Agency (alpha) weights — declared priors, not fitted --------------------------
# Every POSITIVE term is gated on (has_spent & spend_after_exposure). That gate is what
# makes alpha == 0 an absolute for a never-spent address rather than a weighted opinion,
# and it is asserted by tests/adversarial_provenance/test_invariants.py.
ALPHA_WEIGHTS = {
    "base_spend": 0.45,
    "commingling_bonus": 0.45,
    "repeat_bonus": 0.15,
    "first_contact_pen": -0.25,
    # Declared but NOT APPLIED in this build — see UNAVAILABLE_COMPONENTS below.
    "dust_penalty": -0.30,
    "injection_penalty": -0.20,
}

REPEAT_COUNTERPARTY_MIN_LINKS = 3   # distinct tainted txs before "repeat counterparty"
HOPS_K = 5                          # haircut propagation depth

# --- Exposure reference for estimator E2 -------------------------------------------
# The blueprint writes `tainted_txids` without defining it. Both readings are implemented
# and both are measured; headline_stats reports the alpha==0 count under each so the
# choice is visible rather than buried.
#
#   SEED_SPEND     transactions that spend from a class-1 illicit address.
#                  Measured on this dataset: reaches only 4,826 addresses -- 4.3% of the
#                  113,159 that carry baseline taint. Every address at hop 2 or beyond is
#                  therefore never "exposed", gets alpha = 0, and blocks all further
#                  propagation, collapsing risk_cwt onto the pinned seeds themselves.
#                  Retained as a declared sensitivity bound, not used as the default,
#                  because a model that only re-reports its own labels measures nothing.
#
#   BASELINE_TAINT transactions that spend from any address carrying nonzero baseline
#                  haircut taint. Non-circular: baseline is computed with alpha == 1 and
#                  never reads alpha. Strict superset of SEED_SPEND. DEFAULT.
EXPOSURE_MODES = ("BASELINE_TAINT", "SEED_SPEND")
DEFAULT_EXPOSURE_MODE = "BASELINE_TAINT"

# Exoneration rate is reported across this sweep rather than at one hand-picked cut, so
# the headline number cannot be accused of threshold shopping.
THRESHOLD_SWEEP = [0.10, 0.25, 0.50, 0.75, 0.90]
DEFAULT_THRESHOLD = 0.50

# --- The honesty contract (blueprint §0.2) -----------------------------------------
# Stamped verbatim into _manifest.json on every run and rendered in the UI.
ESTIMATORS = {
    "E1_value_share": {
        "mode": "DEGREE_UNIFORM",
        "observed": "AddrTx / TxAddr edges (unweighted address-transaction incidence)",
        "estimated": "per-edge BTC value",
        "why": (
            "AddrTx_edgelist.csv and TxAddr_edgelist.csv carry only (address, txId) pairs "
            "with no value column, so every edge is weighted equally: P[t,a] = 1/indegree(t) "
            "and R[a,t] = 1/receive_degree(a). This is the weaker of the blueprint's two "
            "value modes and it is declared, not silently assumed."
        ),
    },
    "E2_spend_after_exposure": {
        "mode": "TIMESTEP_ORDERED_BASELINE_TAINT_EXPOSURE",
        "observed": "address spent at some Time step; address received at some Time step",
        "estimated": "whether the specific output received was the one later spent",
        "why": (
            "Elliptic++ is address-transaction bipartite, not a UTXO ledger, so individual "
            "outputs cannot be followed to individual spends. An address counts as having "
            "spent after exposure only if min(spend Time step) >= min(tainted-receipt Time "
            "step). 'Tainted receipt' is referenced to the INDUSTRY baseline haircut score, "
            "which is computed with alpha identically 1 and therefore does not depend on "
            "alpha at all -- so this is a two-stage ordering, not a circular definition. "
            "See EXPOSURE_MODES for the narrower alternative and why it is not the default."
        ),
    },
    "E3_network_layer": {
        "mode": "NOT_USED",
        "observed": "n/a",
        "estimated": "n/a",
        "why": (
            "The synthetic ASN/GeoIP layer is not read by this module at all. Module C "
            "(taint injection detection) is not built in this pass, and Modules A and B are "
            "pure-blockchain by design — so the agency and exoneration results here rest "
            "entirely on real Elliptic++ address-transaction structure."
        ),
    },
}

# Alpha components the blueprint defines that CANNOT be computed from the data actually
# available here. They are held at their neutral value and declared, never approximated.
UNAVAILABLE_COMPONENTS = {
    "dust_exposure": (
        "Requires per-edge BTC value to decide what is sub-economic. Under E1="
        "DEGREE_UNIFORM there is no value signal, so dust_penalty is NOT APPLIED and "
        "dust_exposure is False for every address. Not estimated, not guessed."
    ),
    "in_quarantine": (
        "Set by Module C (taint injection detector), which is deferred in this build. "
        "injection_penalty is NOT APPLIED and in_quarantine is False for every address."
    ),
}

MULTIPLICITY_MODE = "COLLAPSED"  # duplicate (address, txId) pairs collapsed; verified 0 present
