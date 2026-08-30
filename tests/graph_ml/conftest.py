"""Shared fixtures: a small synthetic tx graph (no dependency on the real Elliptic download)
so graph_ml tests run fast, offline, and in CI without the ~700MB dataset present.
"""

from __future__ import annotations

import numpy as np
import pandas as pd
import pytest

N_FEATURES = 6
RNG_SEED = 7


@pytest.fixture
def synthetic_nodes_df() -> pd.DataFrame:
    """30 tx nodes across 2 time steps: 10 illicit, 10 licit, 10 unknown.

    Illicit nodes get a deliberately shifted feat_0 so the classifier has a real signal
    to learn and holdout accuracy isn't just noise.
    """
    rng = np.random.default_rng(RNG_SEED)
    n_per_class = 10
    rows = []
    tx_id = 1000
    for label, shift in [("illicit", 5.0), ("licit", 0.0), ("unknown", 2.5)]:
        for _ in range(n_per_class):
            feats = rng.normal(loc=shift, scale=1.0, size=N_FEATURES)
            rows.append(
                {
                    "txId": tx_id,
                    "time_step": tx_id % 2,
                    **{f"feat_{i}": feats[i] for i in range(N_FEATURES)},
                    "class": label,
                }
            )
            tx_id += 1
    return pd.DataFrame(rows)


@pytest.fixture
def synthetic_edges_df(synthetic_nodes_df: pd.DataFrame) -> pd.DataFrame:
    """Chain each class's nodes into their own connected component, so Louvain has a
    clear community structure to recover.
    """
    edges = []
    for _, group in synthetic_nodes_df.groupby("class"):
        ids = group["txId"].tolist()
        for a, b in zip(ids, ids[1:]):
            edges.append({"txId1": a, "txId2": b})
    return pd.DataFrame(edges)
