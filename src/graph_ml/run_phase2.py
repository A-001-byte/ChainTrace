"""CLI entry point for Phase 2's checkpoint (Section 7 of the prototype plan):

    "given the merged dataset, script outputs a ranked list of top-N suspicious wallets
    with score + top 2-3 contributing features"

Usage:
    python -m src.graph_ml.run_phase2                    # full Elliptic dataset (49 time steps)
    python -m src.graph_ml.run_phase2 --sample-timesteps 3 --top-n 20
"""

from __future__ import annotations

import argparse
import logging
import time
from pathlib import Path

import pandas as pd

from . import config, intent_classifier, pipeline


def main() -> None:
    parser = argparse.ArgumentParser(description="Run ChainTrace Phase 2: Graph + ML core")
    parser.add_argument(
        "--sample-timesteps",
        type=int,
        default=None,
        help="Subsample the Elliptic graph to the first N time steps (faster on a laptop).",
    )
    parser.add_argument("--top-n", type=int, default=config.TOP_N_ALERTS, help="Number of top alerts to show/save.")
    parser.add_argument(
        "--unknown-only",
        action="store_true",
        help="Filter alerts to unknown nodes only (new discoveries, excluding already-known illicit/licit labels).",
    )
    parser.add_argument(
        "--combined",
        action="store_true",
        help="Include both top-N known alerts and top-N unknown new discoveries in the output.",
    )
    parser.add_argument(
        "--save",
        action="store_true",
        help="Also write the full ranked alert list to outputs/alerts/ranked_alerts.csv",
    )
    parser.add_argument(
        "--skip-intent",
        action="store_true",
        help="Skip intent-archetype classification (runs by default after alerts are built).",
    )
    args = parser.parse_args()

    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")
    logger = logging.getLogger(__name__)

    graph, alerts = pipeline.run(
        sample_timesteps=args.sample_timesteps,
        top_n=args.top_n,
        unknown_only=args.unknown_only,
        combined=args.combined,
    )

    if not args.skip_intent:
        # Called after alerts already exist, purely additive — see intent_classifier.py's
        # module docstring for why this is a rule-based matcher, not a trained classifier.
        t0 = time.time()
        unified_dataset_path = Path("data/processed/unified_dataset.csv")
        tx_df = pd.read_csv(unified_dataset_path) if unified_dataset_path.exists() else None
        if tx_df is None:
            logger.warning(
                "data/processed/unified_dataset.csv not found — intent timing signal will "
                "report 'insufficient signal' for every entity rather than a faked substitute."
            )
        alerts = intent_classifier.classify_intents(graph, alerts, tx_df)
        logger.info("Intent classification added %.1fs on top of the pipeline run", time.time() - t0)

    pd.set_option("display.max_colwidth", 80)
    pd.set_option("display.width", 200)
    print("\n=== ChainTrace — Top ranked alerts ===")
    display_cols = ["node_id", "node_type", "label", "is_known_label", "cluster_id", "risk_score", "reason"]
    if not args.skip_intent:
        display_cols += ["intent_label", "intent_confidence"]
    print(alerts[display_cols].to_string(index=False))

    if args.save:
        config.ALERTS_DIR.mkdir(parents=True, exist_ok=True)
        out_path = config.ALERTS_DIR / "ranked_alerts.csv"
        alerts.to_csv(out_path, index=False)
        print(f"\nSaved full ranked alert list to {out_path}")


if __name__ == "__main__":
    main()
