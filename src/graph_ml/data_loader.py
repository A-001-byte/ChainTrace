"""Loads Elliptic (tx-level) and, when present, Elliptic++ (wallet/actor-level) raw CSVs
into clean pandas DataFrames ready for graph construction.

Elliptic++ wallet data is optional at this stage: if the files aren't in
data/raw/elliptic_pp/ yet (waiting on the Google Drive download), the pipeline still runs
on the Elliptic transaction graph alone — just without wallet nodes.
"""

from __future__ import annotations

import logging
import re

import pandas as pd

from . import config

logger = logging.getLogger(__name__)


def load_elliptic_transactions(sample_timesteps: int | None = None) -> tuple[pd.DataFrame, pd.DataFrame]:
    """Load Elliptic tx features+classes (merged) and the tx-tx edgelist.

    Args:
        sample_timesteps: if set, keep only the first N time steps (Section 8 risk
            mitigation: "subsample the Elliptic graph ... for the demo, still real data").

    Returns:
        (nodes_df, edges_df)
        nodes_df columns: txId, time_step, feat_0..feat_163, class (illicit/licit/unknown)
        edges_df columns: txId1, txId2
    """
    if not config.ELLIPTIC_FEATURES_CSV.exists():
        raise FileNotFoundError(
            f"Elliptic features file not found at {config.ELLIPTIC_FEATURES_CSV}. "
            "Run Phase 0 first: extract the Kaggle Elliptic dataset into data/raw/elliptic/."
        )

    features = pd.read_csv(config.ELLIPTIC_FEATURES_CSV, header=None)
    n_feature_cols = features.shape[1] - 2  # minus txId, time_step
    features.columns = ["txId", "time_step"] + [f"feat_{i}" for i in range(n_feature_cols)]

    classes = pd.read_csv(config.ELLIPTIC_CLASSES_CSV)
    classes["class"] = classes["class"].map(config.CLASS_LABEL_MAP).fillna("unknown")

    nodes = features.merge(classes, on="txId", how="left")
    nodes["class"] = nodes["class"].fillna("unknown")

    edges = pd.read_csv(config.ELLIPTIC_EDGELIST_CSV)

    if sample_timesteps is not None:
        keep_steps = sorted(nodes["time_step"].unique())[:sample_timesteps]
        nodes = nodes[nodes["time_step"].isin(keep_steps)].copy()
        keep_ids = set(nodes["txId"])
        edges = edges[edges["txId1"].isin(keep_ids) & edges["txId2"].isin(keep_ids)].copy()
        logger.info(
            "Subsampled to %d time steps -> %d tx nodes, %d edges",
            sample_timesteps, len(nodes), len(edges),
        )

    logger.info("Loaded %d transaction nodes, %d edges", len(nodes), len(edges))
    return nodes, edges


def elliptic_pp_available() -> bool:
    """True if the real Elliptic++ CSVs (not LFS pointer stubs) are in place."""
    required = [config.WALLETS_FEATURES_CSV, config.WALLETS_CLASSES_CSV, config.ADDR_TX_EDGELIST_CSV]
    if not all(p.exists() for p in required):
        return False
    # LFS pointer stubs are ~130 bytes; the real files are tens/hundreds of MB.
    return all(p.stat().st_size > 10_000 for p in required)


def _sanitize_column_name(name: str) -> str:
    """Turn a raw CSV header into a valid Python identifier (itertuples() silently drops
    named access for columns with spaces, e.g. Elliptic++'s "Time step" and
    "num_txs_as receiver" — verified against the real downloaded files).
    """
    return re.sub(r"\W+", "_", name.strip()).strip("_")


def load_elliptic_pp_wallets(
    keep_tx_ids: set | None = None,
) -> tuple[pd.DataFrame, pd.DataFrame, pd.DataFrame]:
    """Load Elliptic++ wallet features+classes and the addr<->tx edgelists.

    Args:
        keep_tx_ids: if given (e.g. because the tx graph was subsampled to a few time
            steps), only keep addr<->tx edges touching these txIds, and only wallets that
            are still connected to the graph through one of those edges. Pass None to load
            every wallet regardless of tx-side subsampling (the default, full-fidelity run).

    Returns:
        (wallets_df, addr_tx_edges_df, tx_addr_edges_df)
        wallets_df columns: address, class (illicit/licit/unknown), time_step (nullable),
            plus wallet feature columns (raw Elliptic++ column names, sanitized to
            valid identifiers — see _sanitize_column_name)
        addr_tx_edges_df columns: address, txId  (wallet -> tx it funded)
        tx_addr_edges_df columns: txId, address  (tx -> wallet it paid out to)

    Raises:
        FileNotFoundError if the files aren't present or are still LFS pointer stubs.
    """
    if not elliptic_pp_available():
        raise FileNotFoundError(
            f"Elliptic++ wallet data not found (or still Git-LFS pointer stubs) under "
            f"{config.ELLIPTIC_PP_DIR}. Download the real CSVs from the Google Drive link in "
            "the Elliptic++ README and drop them there, or call load_elliptic_transactions() "
            "alone to run tx-only."
        )

    wallets_features = pd.read_csv(config.WALLETS_FEATURES_CSV)
    wallets_classes = pd.read_csv(config.WALLETS_CLASSES_CSV)

    # Normalize the join key name — the published schema uses "address"; guard for variants.
    addr_col = next((c for c in wallets_features.columns if c.lower() in ("address", "addr")), None)
    if addr_col is None:
        raise ValueError(
            f"Could not find an address column in wallets_features.csv; got columns: "
            f"{list(wallets_features.columns)[:5]}..."
        )
    if addr_col != "address":
        wallets_features = wallets_features.rename(columns={addr_col: "address"})
        wallets_classes = wallets_classes.rename(columns={addr_col: "address"})

    # The real file has a "Time step" column (capital T, space) — pull it out as its own
    # node attribute (mirrors tx nodes' time_step) rather than leaving it as a numeric
    # "feature", and sanitize every other column name so itertuples() can expose them.
    time_step_col = next((c for c in wallets_features.columns if c.strip().lower() == "time step"), None)
    if time_step_col is not None:
        wallets_features = wallets_features.rename(columns={time_step_col: "time_step"})

    rename_map = {
        c: _sanitize_column_name(c) for c in wallets_features.columns if c not in ("address", "time_step")
    }
    wallets_features = wallets_features.rename(columns=rename_map)

    class_col = next((c for c in wallets_classes.columns if c != "address"), "class")
    wallets_classes = wallets_classes.rename(columns={class_col: "class"})
    wallets_classes["class"] = wallets_classes["class"].astype(str).map(config.CLASS_LABEL_MAP).fillna("unknown")

    wallets = wallets_features.merge(wallets_classes[["address", "class"]], on="address", how="left")
    wallets["class"] = wallets["class"].fillna("unknown")

    # wallets_features.csv is temporal: a wallet with activity across multiple time steps
    # gets one row per time step it appeared in (1,268,260 rows for 822,942 unique addresses
    # — confirmed against the real download), and each row's stats (btc_transacted_total,
    # num_txs_as_sender, ...) read as cumulative-to-that-time-step. graph_builder keys wallet
    # nodes by address alone, so it keeps whichever row is iterated last per address — sort
    # here so that's always the highest time_step (the most complete, final snapshot) rather
    # than relying on the CSV happening to already be in that order.
    if "time_step" in wallets.columns:
        wallets = wallets.sort_values(["address", "time_step"]).reset_index(drop=True)

    addr_tx_edges = pd.read_csv(config.ADDR_TX_EDGELIST_CSV).rename(columns={"input_address": "address"})
    tx_addr_edges = pd.read_csv(config.TX_ADDR_EDGELIST_CSV).rename(columns={"output_address": "address"})

    if keep_tx_ids is not None:
        addr_tx_edges = addr_tx_edges[addr_tx_edges["txId"].isin(keep_tx_ids)].copy()
        tx_addr_edges = tx_addr_edges[tx_addr_edges["txId"].isin(keep_tx_ids)].copy()
        relevant_addresses = set(addr_tx_edges["address"]) | set(tx_addr_edges["address"])
        wallets = wallets[wallets["address"].isin(relevant_addresses)].copy()
        logger.info(
            "Filtered wallet layer to the subsampled tx set: %d wallets, %d addr->tx edges, %d tx->addr edges",
            len(wallets), len(addr_tx_edges), len(tx_addr_edges),
        )

    logger.info(
        "Loaded %d wallet nodes, %d addr->tx edges, %d tx->addr edges",
        len(wallets), len(addr_tx_edges), len(tx_addr_edges),
    )
    return wallets, addr_tx_edges, tx_addr_edges
