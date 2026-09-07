"""Module A — the agency vector alpha.

The claim this module makes, stated precisely:

    An address that never appears as a transaction INPUT anywhere in Elliptic++ has never
    had a signature produced against it in this dataset. It received value; it never
    exercised spend authority over that value. Under a haircut model it can still be
    flagged as tainted, because haircut propagates on receipt alone.

That is a set difference over two real CSVs, not an inference or a model output.

What it is NOT: proof of innocence in the real world, and not a statement about the
Bitcoin ledger at large. It is a statement about the address-transaction structure
recorded in this dataset. See config.ESTIMATORS for what is estimated rather than
observed.
"""

from __future__ import annotations

import numpy as np
import pandas as pd

from . import config
from .io import Edges


def tainted_transactions(
    edges: Edges,
    seeds: pd.Index,
    mode: str,
    risk_baseline: pd.Series | None = None,
) -> pd.Index:
    """Transactions whose INPUTS carry taint — the reference set "exposure" is measured
    against in estimator E2. See config.EXPOSURE_MODES for why there are two.

    Neither mode reads alpha, so neither is circular with the quantity being computed.
    """
    at = edges.at
    if mode == "SEED_SPEND":
        tainted_addrs = pd.Index(seeds)
    elif mode == "BASELINE_TAINT":
        if risk_baseline is None:
            raise ValueError("BASELINE_TAINT exposure requires risk_baseline")
        tainted_addrs = risk_baseline.index[risk_baseline.values > 0]
    else:
        raise ValueError(f"unknown exposure mode {mode!r}")
    return pd.Index(at.loc[at.address.isin(tainted_addrs), "txId"].unique())


def compute_agency(
    edges: Edges,
    seeds: pd.Index,
    tx_ts: pd.Series,
    exposure_mode: str,
    risk_baseline: pd.Series | None = None,
) -> pd.DataFrame:
    """Build the per-address agency table. One column per alpha term, so the UI can show
    the derivation rather than a bare number."""
    at, ta = edges.at, edges.ta

    spent_set = set(at.address)
    received_set = set(ta.address)
    universe = pd.Index(sorted(spent_set | received_set), name="address")

    ag = pd.DataFrame(index=universe)

    # --- component 1: base spend authority (exact, observed) -----------------------
    ag["has_spent"] = ag.index.isin(spent_set)
    ag["has_received"] = ag.index.isin(received_set)

    # --- component 2: spend AFTER exposure (estimator E2) --------------------------
    tainted_txids = tainted_transactions(edges, seeds, exposure_mode, risk_baseline)

    at_ts = at[["address", "txId"]].copy()
    at_ts["ts"] = at_ts.txId.map(tx_ts)
    first_spend_ts = at_ts.groupby("address").ts.min()

    recv_tainted = ta.loc[ta.txId.isin(tainted_txids), ["address", "txId"]].copy()
    recv_tainted["ts"] = recv_tainted.txId.map(tx_ts)
    first_taint_recv_ts = recv_tainted.groupby("address").ts.min()

    fs = ag.index.map(first_spend_ts)
    fx = ag.index.map(first_taint_recv_ts)
    # NaN on either side -> False. An address never exposed to a seed-spending transaction
    # yields False here, which drives alpha to 0: deliberately a LOWER BOUND on agency,
    # declared as such in config.ESTIMATORS["E2_spend_after_exposure"].
    with np.errstate(invalid="ignore"):
        ag["spend_after_exposure"] = pd.Series(
            np.asarray(fs, dtype="float64") >= np.asarray(fx, dtype="float64"),
            index=ag.index,
        ).fillna(False)

    # --- component 3: commingling (co-spend evidence, exact) -----------------------
    tx_indeg = at.groupby("txId").address.nunique()
    multi_input_txs = set(tx_indeg[tx_indeg >= 2].index)
    ag["commingled"] = ag.index.isin(set(at.loc[at.txId.isin(multi_input_txs), "address"]))

    # --- component 4: repeat counterparty with a tainted source (exact) ------------
    link = recv_tainted.groupby("address").txId.nunique()
    ag["n_taint_links"] = ag.index.map(link).fillna(0).astype(np.int32)
    ag["repeat_counterparty"] = ag.n_taint_links >= config.REPEAT_COUNTERPARTY_MIN_LINKS
    ag["first_contact"] = ag.n_taint_links == 1

    # --- component 5: components that CANNOT be computed from available data -------
    # Held neutral and declared in config.UNAVAILABLE_COMPONENTS. Not approximated.
    ag["dust_exposure"] = False     # needs per-edge BTC value; E1 is DEGREE_UNIFORM
    ag["in_quarantine"] = False     # set by Module C, deferred in this build

    # --- assemble alpha ------------------------------------------------------------
    w = config.ALPHA_WEIGHTS
    ag["alpha"] = 0.0
    gate = ag.has_spent & ag.spend_after_exposure          # THE gate
    ag.loc[gate, "alpha"] += w["base_spend"]
    ag.loc[gate & ag.commingled, "alpha"] += w["commingling_bonus"]
    ag.loc[gate & ag.repeat_counterparty, "alpha"] += w["repeat_bonus"]
    ag.loc[ag.first_contact, "alpha"] += w["first_contact_pen"]
    # dust_penalty and injection_penalty are intentionally NOT applied — see above.
    ag["alpha"] = ag.alpha.clip(0.0, 1.0).astype(np.float32)

    ag["evidence_reason"] = _reasons(ag)
    return ag


def _reasons(ag: pd.DataFrame) -> pd.Series:
    """Generated, never hardcoded: the string is assembled from the row's own flags."""
    out = pd.Series("", index=ag.index, dtype=object)

    never_spent = ~ag.has_spent
    out[never_spent] = "Never exercised spend authority (no signature produced in this dataset)"

    pre_exposure = ag.has_spent & ~ag.spend_after_exposure
    out[pre_exposure] = "No spend recorded at or after first tainted receipt"

    rest = ag.has_spent & ag.spend_after_exposure
    if rest.any():
        sub = ag[rest]
        bits = pd.Series("Spend authority exercised after exposure", index=sub.index, dtype=object)
        bits = bits.where(~sub.commingled, bits + "; commingled with own funds in a multi-input transaction")
        bits = bits.where(
            ~sub.repeat_counterparty,
            bits + "; " + sub.n_taint_links.astype(str) + " independent links to a tainted source",
        )
        bits = bits.where(~sub.first_contact, bits + "; single first-contact exposure")
        out[rest] = bits
    return out
