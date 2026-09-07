"""Validation harness for the Geo-Temporal Mismatch detector ("VPN Catcher", USP 1).

THIS IS THE ONLY FILE IN THE REPOSITORY ALLOWED TO OPEN geo_ground_truth.csv.

src/graph_ml/geo_temporal.py (the detector) is deliberately blind to
data/processed/geo_ground_truth.csv — it never reads, imports, or references it. That
file is where a teammate plants known evasion cases (wallet_id, planted, claimed_country,
peak_utc_hour) specifically so this script can score the detector's output against ground
truth it never saw while making its decisions. That separation is what turns "we detected
our own generator" into an actual validation result: run the detector, then only
afterwards check its homework here.

tests/graph_ml/test_geo_temporal.py greps every file under src/ for any reference to
geo_ground_truth.csv and fails if it finds one — the blindness isn't just described in
this docstring, it's enforced.

Usage:
    python scripts/score_vpn_catcher.py
"""

from __future__ import annotations

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import pandas as pd

from src.data_pipeline.config import PROCESSED_DIR
from src.graph_ml.geo_temporal import detect_geo_temporal_mismatches

GROUND_TRUTH_CSV = PROCESSED_DIR / "geo_ground_truth.csv"


def score(ground_truth_path: Path = GROUND_TRUTH_CSV) -> dict:
    """Run the (ground-truth-blind) detector, then join its output against
    geo_ground_truth.csv to compute catch rate, false positives, precision, and recall.

    Ground truth schema (produced by a teammate, not by this codebase):
        wallet_id, planted (bool — True = a deliberately planted evasion case),
        claimed_country, peak_utc_hour

    Metrics are computed only over wallets present in the ground-truth file — it's a
    labeled validation set, not a claim about the other ~800k unlabeled wallets.
    """
    if not ground_truth_path.exists():
        raise FileNotFoundError(
            f"{ground_truth_path} not found. This is expected until the ground-truth "
            "file has been generated/planted — the detector itself does not need it to "
            "run, only this scoring script does."
        )

    ground_truth = pd.read_csv(ground_truth_path)
    required_cols = {"wallet_id", "planted"}
    missing = required_cols - set(ground_truth.columns)
    if missing:
        raise ValueError(f"{ground_truth_path} is missing required column(s): {sorted(missing)}")

    # The detector runs exactly as it would in production — no ground-truth data is
    # passed into it, and geo_temporal.py has no code path that could read this file.
    detected = detect_geo_temporal_mismatches()[["wallet_id", "geo_temporal_flag"]]

    merged = ground_truth.merge(detected, on="wallet_id", how="left")
    # A ground-truth wallet the detector never saw in unified_dataset.csv at all
    # (no transactions indexed) counts as "not flagged" for scoring purposes.
    merged["geo_temporal_flag"] = merged["geo_temporal_flag"].fillna(False).astype(bool)
    merged["planted"] = merged["planted"].astype(bool)

    planted = merged[merged["planted"]]
    not_planted = merged[~merged["planted"]]

    true_positives = int(planted["geo_temporal_flag"].sum())
    total_planted = len(planted)
    false_negatives = total_planted - true_positives

    false_positives = int(not_planted["geo_temporal_flag"].sum())
    total_not_planted = len(not_planted)
    true_negatives = total_not_planted - false_positives

    recall = true_positives / total_planted if total_planted else 0.0
    precision = (
        true_positives / (true_positives + false_positives)
        if (true_positives + false_positives) > 0
        else 0.0
    )
    false_positive_rate = false_positives / total_not_planted if total_not_planted else 0.0

    return {
        "true_positives": true_positives,
        "total_planted": total_planted,
        "false_negatives": false_negatives,
        "false_positives": false_positives,
        "true_negatives": true_negatives,
        "total_not_planted": total_not_planted,
        "recall": recall,
        "precision": precision,
        "false_positive_rate": false_positive_rate,
        "merged": merged,
    }


def _print_report(result: dict) -> None:
    tp = result["true_positives"]
    m = result["total_planted"]
    fp = result["false_positives"]
    fpr = result["false_positive_rate"]
    precision = result["precision"]
    recall = result["recall"]

    print("=" * 70)
    print("  VPN Catcher — Geo-Temporal Mismatch validation")
    print("=" * 70)
    print(f"  Caught {tp} of {m} planted evaders")
    print(f"  {fp} false positives ({fpr * 100:.2f}% false-positive rate, "
          f"of {result['total_not_planted']} non-planted labeled wallets)")
    print(f"  Precision: {precision:.4f}")
    print(f"  Recall:    {recall:.4f}")
    print("=" * 70)


if __name__ == "__main__":
    result = score()
    _print_report(result)
