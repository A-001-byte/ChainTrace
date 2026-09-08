"""Module B entry point — Cluster Fragility Index and the ablated lower bound.

    python -m src.adversarial_provenance.pipeline_b

Requires Module A to have run first (it reuses agency.parquet's alpha unchanged, so the
ablation isolates the effect of removing fragile merges rather than confounding it with a
different agency vector).

Writes, under data/processed/adversarial_provenance/:
    clusters.parquet       address -> cluster_id, cluster_size
    cfi.parquet            cluster_id -> cfi, n_fragile_tx, cfi_status
    fragile_edges.parquet  the single-witness merges themselves
    taint_scores.parquet   UPDATED in place with risk_cwt_ablated, fragility_span, queue
    _manifest_b.json       Module B's own run record
"""

from __future__ import annotations

import json
import logging
import subprocess
import time
import uuid

import networkx as nx
import numpy as np
import pandas as pd

from . import config, flow, fragility, io

logger = logging.getLogger(__name__)

# An alert whose score depends this heavily on unreplicated merges is ROUTED to a separate
# queue, not suppressed. That distinction is the answer to "aren't you just lowering
# sensitivity", and the queue must carry a nonzero count to be worth anything.
FRAGILE_SPAN_THRESHOLD = 0.4

MANIFEST_B_JSON = config.OUTPUT_DIR / "_manifest_b.json"
CLUSTERS_PARQUET = config.OUTPUT_DIR / "clusters.parquet"
CFI_PARQUET = config.OUTPUT_DIR / "cfi.parquet"
FRAGILE_EDGES_PARQUET = config.OUTPUT_DIR / "fragile_edges.parquet"


def _git_sha() -> str:
    try:
        return subprocess.check_output(
            ["git", "rev-parse", "HEAD"], cwd=config.REPO_ROOT, text=True
        ).strip()
    except Exception:
        return "UNKNOWN"


def run() -> dict:
    t0 = time.time()
    if not config.AGENCY_PARQUET.exists():
        raise FileNotFoundError(
            "Module A output missing. Run python -m src.adversarial_provenance.pipeline first."
        )

    edges = io.load_edges()
    classes = io.load_wallet_classes()
    universe = pd.Index(edges.addr_index.index, name="address")
    seeds = io.seed_addresses(classes, universe)

    logger.info("Building bipartite address-transaction graph...")
    B = fragility.build_bipartite(edges.at)
    logger.info("  %d nodes, %d edges", B.number_of_nodes(), B.number_of_edges())

    logger.info("Scoring cluster fragility over every component...")
    cfi_df, frag_df = fragility.compute_all(B)
    logger.info("  %d clusters, %d fragile merges", len(cfi_df), len(frag_df))

    # address -> cluster
    clusters = fragility.clusters_from_bipartite(B)
    ai_to_addr = pd.Series(edges.addr_index.index.values, index=edges.addr_index.values)
    clusters["address"] = clusters.ai.map(ai_to_addr)
    clusters = clusters.merge(
        cfi_df[["cluster_id", "n_addr", "cfi", "cfi_status"]].rename(columns={"n_addr": "cluster_size"}),
        on="cluster_id", how="left",
    )

    # --- Ablated taint: the lower bound of the interval ---------------------------
    # Drop the single-witness merges from the INPUT side and re-propagate with the SAME
    # alpha, so the only thing that changed is the fragile evidence.
    logger.info("Re-propagating with fragile merges removed...")
    ag = pd.read_parquet(config.AGENCY_PARQUET).set_index("address").reindex(universe)
    fragile_ti = set(frag_df.ti.tolist())
    at_ablated = edges.at[~edges.at.ti.isin(fragile_ti)]
    P_abl = flow.build_P(at_ablated, edges.n_tx, edges.n_addr)
    R = flow.build_R(edges.ta, edges.n_addr, edges.n_tx)
    seed_idx = edges.addr_index.loc[seeds].values
    risk_cwt_ablated = flow.propagate(
        R, P_abl, ag.alpha.values.astype(np.float64), seed_idx, config.HOPS_K
    )

    # --- Merge into the taint table -----------------------------------------------
    taint = pd.read_parquet(config.TAINT_PARQUET).set_index("address").reindex(universe)
    taint["risk_cwt_ablated"] = risk_cwt_ablated.astype(np.float32)
    # The interval a judge can point at: [ablated lower bound, industry upper bound].
    taint["fragility_span"] = (taint.risk_baseline - taint.risk_cwt_ablated).astype(np.float32)
    taint["queue"] = np.where(
        taint.fragility_span > FRAGILE_SPAN_THRESHOLD, "CONTESTED_EVIDENCE", "STANDARD"
    )
    taint = taint.join(
        clusters.set_index("address")[["cluster_id", "cluster_size", "cfi", "cfi_status"]],
        how="left",
    )

    config.OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    clusters[["address", "cluster_id", "cluster_size", "cfi", "cfi_status"]].to_parquet(
        CLUSTERS_PARQUET, index=False
    )
    cfi_df.to_parquet(CFI_PARQUET, index=False)
    frag_df.assign(split_sizes=frag_df.split_sizes.apply(list)).to_parquet(
        FRAGILE_EDGES_PARQUET, index=False
    )
    taint.reset_index().to_parquet(config.TAINT_PARQUET, index=False)

    scored = cfi_df[cfi_df.cfi_status == "OK"]
    elapsed = time.time() - t0
    manifest = {
        "run_id": uuid.uuid4().hex,
        "git_sha": _git_sha(),
        "module": "adversarial_provenance/B (cluster fragility index)",
        "generated_at_unix": int(time.time()),
        "elapsed_seconds": round(elapsed, 2),
        "n_clusters_total": int(len(cfi_df)),
        "n_clusters_scored": int(len(scored)),
        "n_clusters_trivial": int((cfi_df.cfi_status == "TRIVIAL").sum()),
        "n_clusters_skipped_oversize": int((cfi_df.cfi_status == "SKIPPED_OVERSIZE").sum()),
        "n_fragile_merges": int(len(frag_df)),
        "largest_cluster_addresses": int(cfi_df.n_addr.max()),
        "max_component_size_cap": fragility.MAX_COMPONENT_SIZE,
        "min_cluster_addresses": fragility.MIN_CLUSTER_ADDRESSES,
        "fragile_span_threshold": FRAGILE_SPAN_THRESHOLD,
        "n_contested_evidence": int((taint.queue == "CONTESTED_EVIDENCE").sum()),
        "algorithm": (
            "Bipartite address-transaction connectivity; transaction-node articulation "
            "points are the single-witness merges. CFI computed by one O(V+E) Tarjan DFS "
            "carrying subtree address counts, verified identical to the naive "
            "remove-and-recount on real components."
        ),
        "clustering_equivalence": (
            "Connected components restricted to address nodes are asserted equal to an "
            "independent multi-input union-find in tests/adversarial_provenance/."
        ),
    }
    MANIFEST_B_JSON.write_text(json.dumps(manifest, indent=2), encoding="utf-8")

    logger.info("Module B complete in %.1fs", elapsed)
    return manifest


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")
    run()
