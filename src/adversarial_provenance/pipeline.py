"""Module A entry point.

    python -m src.adversarial_provenance.pipeline

Writes, all under data/processed/adversarial_provenance/:
    agency.parquet       per-address alpha + every component that produced it
    taint_scores.parquet risk_baseline (alpha=1) vs risk_cwt (alpha from data)
    _manifest.json       the honesty contract, stamped on every run
"""

from __future__ import annotations

import json
import logging
import subprocess
import time
import uuid

import numpy as np
import pandas as pd

from . import config, flow, io
from .agency import compute_agency

logger = logging.getLogger(__name__)


def _git_sha() -> str:
    try:
        return subprocess.check_output(
            ["git", "rev-parse", "HEAD"], cwd=config.REPO_ROOT, text=True
        ).strip()
    except Exception:
        return "UNKNOWN"


def run(exposure_mode: str = config.DEFAULT_EXPOSURE_MODE) -> dict:
    t0 = time.time()
    if exposure_mode not in config.EXPOSURE_MODES:
        raise ValueError(f"exposure_mode must be one of {config.EXPOSURE_MODES}")
    config.OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

    logger.info("Loading Elliptic++ edge lists...")
    edges = io.load_edges()
    classes = io.load_wallet_classes()
    logger.info("Loading transaction Time step (estimator E2)...")
    tx_ts = io.load_tx_timesteps()

    universe = pd.Index(edges.addr_index.index, name="address")
    seeds = io.seed_addresses(classes, universe)
    logger.info(
        "%d addresses, %d transactions, %d class-1 illicit seeds present in the edge lists",
        edges.n_addr, edges.n_tx, len(seeds),
    )

    logger.info("Building P / R and propagating %d hops...", config.HOPS_K)
    P = flow.build_P(edges.at, edges.n_tx, edges.n_addr)
    R = flow.build_R(edges.ta, edges.n_addr, edges.n_tx)
    seed_idx = edges.addr_index.loc[seeds].values

    # STAGE 1 — the industry-standard haircut. alpha is identically 1 here, so this stage
    # cannot depend on agency, which is what makes it usable as E2's exposure reference.
    risk_baseline = flow.propagate(R, P, 1.0, seed_idx, config.HOPS_K)
    baseline_series = pd.Series(risk_baseline, index=universe)

    # STAGE 2 — agency, referenced against stage 1.
    logger.info("Computing agency vector (Module A, exposure=%s)...", exposure_mode)
    ag = compute_agency(edges, seeds, tx_ts, exposure_mode, baseline_series).reindex(universe)

    # STAGE 3 — the same propagation, one argument apart. That IS the substitution.
    risk_cwt = flow.propagate(R, P, ag.alpha.values.astype(np.float64), seed_idx, config.HOPS_K)

    taint = pd.DataFrame(
        {
            "risk_baseline": risk_baseline.astype(np.float32),
            "risk_cwt": risk_cwt.astype(np.float32),
        },
        index=universe,
    )
    taint["delta"] = (taint.risk_baseline - taint.risk_cwt).astype(np.float32)
    taint["class_label"] = classes.reindex(universe).fillna(config.CLASS_UNKNOWN).astype(np.int8)

    ag.reset_index().to_parquet(config.AGENCY_PARQUET, index=False)
    taint.reset_index().to_parquet(config.TAINT_PARQUET, index=False)

    elapsed = time.time() - t0
    manifest = {
        "run_id": uuid.uuid4().hex,
        "git_sha": _git_sha(),
        "module": "adversarial_provenance/A (custody-weighted taint)",
        "generated_at_unix": int(time.time()),
        "elapsed_seconds": round(elapsed, 2),
        "n_addresses": int(edges.n_addr),
        "n_transactions": int(edges.n_tx),
        "n_seeds_illicit": int(len(seeds)),
        "n_spent": int(ag.has_spent.sum()),
        "n_never_spent": int((~ag.has_spent).sum()),
        "hops_K": config.HOPS_K,
        "exposure_mode": exposure_mode,
        "alpha_weights": config.ALPHA_WEIGHTS,
        "alpha_weights_applied": [
            k for k in config.ALPHA_WEIGHTS if k not in ("dust_penalty", "injection_penalty")
        ],
        "multiplicity_mode": config.MULTIPLICITY_MODE,
        "estimators": config.ESTIMATORS,
        "unavailable_components": config.UNAVAILABLE_COMPONENTS,
        "modules_built": ["A"],
        "modules_deferred": {
            "B_cluster_fragility": "not built in this run",
            "C_taint_injection_detector": "deferred by scope decision",
        },
        "source_files": {
            "addrtx": str(config.ADDRTX_CSV.relative_to(config.REPO_ROOT)),
            "txaddr": str(config.TXADDR_CSV.relative_to(config.REPO_ROOT)),
            "wallets_classes": str(config.WALLETS_CLASSES_CSV.relative_to(config.REPO_ROOT)),
            "txs_features": str(config.TXS_FEATURES_CSV.relative_to(config.REPO_ROOT)),
        },
    }
    config.MANIFEST_JSON.write_text(json.dumps(manifest, indent=2), encoding="utf-8")

    logger.info("Wrote %s", config.AGENCY_PARQUET)
    logger.info("Wrote %s", config.TAINT_PARQUET)
    logger.info("Wrote %s", config.MANIFEST_JSON)
    logger.info("Module A complete in %.1fs", elapsed)
    return manifest


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")
    run()
