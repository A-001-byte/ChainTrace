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

import pandas as pd

from . import config, pipeline


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
        "--save",
        action="store_true",
        help="Also write the full ranked alert list to outputs/alerts/ranked_alerts.csv",
    )
    args = parser.parse_args()

    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")

    graph, alerts = pipeline.run(sample_timesteps=args.sample_timesteps, top_n=args.top_n)

    pd.set_option("display.max_colwidth", 80)
    pd.set_option("display.width", 200)
    print("\n=== ChainTrace — Top ranked alerts ===")
    print(
        alerts[["node_id", "node_type", "label", "cluster_id", "risk_score", "reason"]].to_string(index=False)
    )

    if args.save:
        config.ALERTS_DIR.mkdir(parents=True, exist_ok=True)
        out_path = config.ALERTS_DIR / "ranked_alerts.csv"
        alerts.to_csv(out_path, index=False)
        print(f"\nSaved full ranked alert list to {out_path}")


if __name__ == "__main__":
    main()
