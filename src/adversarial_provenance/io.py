"""Loaders and index construction for the Adversarial Provenance Layer.

Column names are used directly and deliberately: this repo's Elliptic++ variant was
verified exhaustively before this module was written, so the blueprint's schema-probe
indirection would add a config layer with nothing to resolve.
"""

from __future__ import annotations

from dataclasses import dataclass

import numpy as np
import pandas as pd

from . import config


@dataclass
class Edges:
    """Address-transaction incidence, integer-indexed.

    at: input side  (address SPENT into a transaction)  -> columns address, txId, ai, ti
    ta: output side (transaction PAID to an address)    -> columns address, txId, ai, ti
    """

    at: pd.DataFrame
    ta: pd.DataFrame
    addr_index: pd.Series   # address -> ai
    tx_index: pd.Series     # txId -> ti

    @property
    def n_addr(self) -> int:
        return len(self.addr_index)

    @property
    def n_tx(self) -> int:
        return len(self.tx_index)


def load_edges() -> Edges:
    """Read both edge lists and assign a canonical integer id to every address and tx."""
    at = pd.read_csv(config.ADDRTX_CSV).rename(columns={"input_address": "address"})
    ta = pd.read_csv(config.TXADDR_CSV).rename(columns={"output_address": "address"})

    # MULTIPLICITY_MODE = COLLAPSED. An address can legitimately fund one transaction from
    # two UTXOs; this variant encodes no such duplicates (verified: 0 dupes on both files),
    # but collapse explicitly so the matrices stay well-defined if that ever changes.
    at = at.drop_duplicates(subset=["address", "txId"])
    ta = ta.drop_duplicates(subset=["txId", "address"])

    addrs = pd.Index(sorted(set(at.address) | set(ta.address)), name="address")
    txs = pd.Index(sorted(set(at.txId) | set(ta.txId)), name="txId")
    addr_index = pd.Series(np.arange(len(addrs), dtype=np.int64), index=addrs)
    tx_index = pd.Series(np.arange(len(txs), dtype=np.int64), index=txs)

    at["ai"] = at.address.map(addr_index).astype(np.int64)
    at["ti"] = at.txId.map(tx_index).astype(np.int64)
    ta["ai"] = ta.address.map(addr_index).astype(np.int64)
    ta["ti"] = ta.txId.map(tx_index).astype(np.int64)

    return Edges(at=at, ta=ta, addr_index=addr_index, tx_index=tx_index)


def load_wallet_classes() -> pd.Series:
    """address -> Elliptic class (1 illicit / 2 licit / 3 unknown)."""
    wc = pd.read_csv(config.WALLETS_CLASSES_CSV)
    return pd.Series(wc["class"].values, index=pd.Index(wc.address, name="address"), name="class")


def load_tx_timesteps() -> pd.Series:
    """txId -> Time step.

    txs_features.csv is ~700MB; only the two columns needed for estimator E2 are read.
    """
    ts = pd.read_csv(config.TXS_FEATURES_CSV, usecols=["txId", "Time step"])
    return pd.Series(ts["Time step"].values, index=pd.Index(ts.txId, name="txId"), name="ts")


def seed_addresses(classes: pd.Series, universe: pd.Index) -> pd.Index:
    """Class-1 (illicit) addresses that actually appear in the edge lists.

    These are pinned to taint 1.0 during propagation.
    """
    illicit = classes[classes == config.CLASS_ILLICIT].index
    return universe.intersection(illicit)
