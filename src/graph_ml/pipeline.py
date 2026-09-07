"""End-to-end Phase 2 orchestration: raw data -> graph -> clusters -> detection ->
explainability -> ranked alerts. This is what run_phase2.py calls, and what Person D
(dashboard integration) will import directly once wiring the dashboard to real output.
"""

from __future__ import annotations

import logging

import networkx as nx
import pandas as pd

from . import data_loader
from .clustering import detect_communities
from .config import TOP_N_ALERTS
from .detection import feature_matrix, score_node_type
from .graph_builder import add_wallet_layer, build_transaction_graph
from .risk_scoring import build_ranked_alerts

logger = logging.getLogger(__name__)

_SEP = "=" * 78

# Printed to stdout (not just the log) when the Elliptic++ wallet layer is absent, so a
# silently-downgraded run can't be mistaken for a successful full-scale one.
_TX_ONLY_BANNER = f"""
{_SEP}
!!  WARNING: RUNNING TX-ONLY  --  ELLIPTIC++ WALLET LAYER DID NOT LOAD  !!
{_SEP}
  The ~823k Elliptic++ wallet layer is MISSING. These results are NOT full-scale
  and must NOT be reported as a full run.

  What this run will produce (TX-ONLY -- raw Elliptic transaction counts only):
        203,769 nodes |   234,355 edges

  What a correct FULL (tx + wallet) run produces:
      1,026,711 nodes | 1,502,615 edges | 368 communities

  Fix: make sure these exist under data/raw/elliptic_pp/, each larger than 10 KB
  and not a Git-LFS pointer stub (a stub starts with the bytes "version"):
      wallets_features.csv
      wallets_classes.csv
      AddrTx_edgelist.csv
      TxAddr_edgelist.csv   (needed by the loader, though it does not gate the
                             availability check)
{_SEP}
"""


def _print_run_summary(
    run_mode: str,
    sample_timesteps: int | None,
    n_nodes: int,
    n_edges: int,
    n_communities: int,
) -> None:
    """Always-on end-of-run summary, printed to stdout.

    States the run mode right next to the counts -- the failure this guards against is a
    tx-only run being read as a full-scale one because the console output looked fine.
    """
    subsampled = (
        "NO (full dataset)"
        if sample_timesteps is None
        else f"YES -- first {sample_timesteps} time steps (NOT full-scale)"
    )
    dashes = "-" * 78
    print(
        f"""
{_SEP}
  ChainTrace Phase 2 -- RUN SUMMARY
{dashes}
  Run mode      : {run_mode}
  Subsampled    : {subsampled}
  Nodes         : {n_nodes:,}
  Edges         : {n_edges:,}
  Communities   : {n_communities:,}
{_SEP}""",
        flush=True,
    )


def run(
    sample_timesteps: int | None = None,
    top_n: int = TOP_N_ALERTS,
    unknown_only: bool = False,
    combined: bool = False,
) -> tuple[nx.Graph, pd.DataFrame]:
    """Run the full Phase 2 pipeline.

    Args:
        sample_timesteps: pass e.g. 3 to subsample the Elliptic graph to the first N time
            steps (Section 8 risk mitigation — keeps the demo fast and laptop-friendly).
        top_n: how many top-ranked alerts to return.
        unknown_only: if True, return only unknown nodes (new discoveries).
        combined: if True, include both top_n known and top_n unknown alerts.

    Returns:
        (graph, ranked_alerts_df)
    """
    logger.info("=== Phase 2: Graph + ML core ===")

    nodes_df, edges_df = data_loader.load_elliptic_transactions(sample_timesteps=sample_timesteps)
    graph = build_transaction_graph(nodes_df, edges_df)

    if data_loader.elliptic_pp_available():
        # When the tx graph is subsampled, filter the wallet layer down to only the wallets
        # still connected to a kept tx — otherwise a 3-time-step demo run would still drag in
        # all ~823k wallets regardless of how few transactions are actually in the graph.
        keep_tx_ids = set(nodes_df["txId"]) if sample_timesteps is not None else None
        wallets_df, addr_tx_edges, tx_addr_edges = data_loader.load_elliptic_pp_wallets(keep_tx_ids=keep_tx_ids)
        graph = add_wallet_layer(graph, wallets_df, addr_tx_edges, tx_addr_edges)
        node_types = ["tx", "wallet"]
        run_mode = "FULL (tx + wallet)"
    else:
        node_types = ["tx"]
        run_mode = "TX-ONLY (wallet layer MISSING)"
        print(_TX_ONLY_BANNER, flush=True)

    cluster_map = detect_communities(graph)
    n_communities = len(set(cluster_map.values()))

    detection_results = []
    feature_frames = {}
    for node_type in node_types:
        prefix = "feat_" if node_type == "tx" else "wallet_"
        _, features = feature_matrix(graph, node_type, prefix)
        feature_frames[node_type] = features
        detection_results.append(score_node_type(graph, node_type, feature_prefix=prefix))

    alerts = build_ranked_alerts(
        graph,
        detection_results,
        feature_frames,
        top_n=top_n,
        unknown_only=unknown_only,
        combined=combined,
    )

    _print_run_summary(
        run_mode=run_mode,
        sample_timesteps=sample_timesteps,
        n_nodes=graph.number_of_nodes(),
        n_edges=graph.number_of_edges(),
        n_communities=n_communities,
    )
    return graph, alerts


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")
    run()
