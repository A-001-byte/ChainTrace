"""Haircut taint propagation, factored.

WHY THIS EXISTS AT ALL (the blueprint offered a shortcut and it does not reach):
The headline exoneration number is defined over the addresses the INDUSTRY-STANDARD model
would flag — "of the wallets a haircut model flags, what fraction never had spend
authority". Producing that set requires actually running the haircut, so a pure
spent-vs-never-spent set difference cannot get there. The propagation is therefore built,
but only the minimum of it: P, R, and one iteration function. No Q matrix, no persisted
index artifacts, no multi-script pipeline.

Both models run through ONE function and differ by ONE argument:
    alpha = 1        -> industry-standard haircut          (risk_baseline)
    alpha = agency   -> custody-weighted taint             (risk_cwt)
"""

from __future__ import annotations

import numpy as np
from scipy import sparse


def build_P(at, n_tx: int, n_addr: int) -> sparse.csr_matrix:
    """Input-share matrix, T x A, row-stochastic.

    Under E1=DEGREE_UNIFORM every input of a transaction carries an equal share, so
    P[t,a] = 1/indegree(t). Row-normalisation below is what enforces that.
    """
    w = np.ones(len(at), dtype=np.float64)
    P = sparse.coo_matrix((w, (at.ti.values, at.ai.values)), shape=(n_tx, n_addr)).tocsr()
    rs = np.asarray(P.sum(axis=1)).ravel()
    rs[rs == 0] = 1.0
    return sparse.diags(1.0 / rs) @ P


def build_R(ta, n_addr: int, n_tx: int) -> sparse.csr_matrix:
    """Receipt-share matrix, A x T, row-stochastic.

    Under E1=DEGREE_UNIFORM this collapses to R[a,t] = 1/receive_degree(a): an address is
    treated as having received equally from each transaction that paid it. With real BTC
    value columns this row would differentiate; it cannot here, which is exactly what the
    E1 declaration in config.py says out loud.
    """
    w = np.ones(len(ta), dtype=np.float64)
    R = sparse.coo_matrix((w, (ta.ai.values, ta.ti.values)), shape=(n_addr, n_tx)).tocsr()
    rs = np.asarray(R.sum(axis=1)).ravel()
    rs[rs == 0] = 1.0
    return sparse.diags(1.0 / rs) @ R


def propagate(
    R: sparse.csr_matrix,
    P: sparse.csr_matrix,
    alpha: np.ndarray | float,
    seed_idx: np.ndarray,
    hops: int,
) -> np.ndarray:
    """Iterate addr_taint <- alpha * (R @ (P @ addr_taint)), pinning seeds at 1.0.

    M = R @ P is never materialised: the sparse-sparse product would densify at this
    scale. Operators are applied sequentially to the vector instead.
    """
    x = np.zeros(P.shape[1], dtype=np.float64)
    x[seed_idx] = 1.0
    for _ in range(hops):
        x = alpha * (R @ (P @ x))
        x[seed_idx] = 1.0
    return x
