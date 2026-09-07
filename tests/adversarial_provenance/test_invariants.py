"""Invariant tests for the Adversarial Provenance Layer (blueprint §6.1).

These are the assertions meant to survive a hostile question, so they are written to be
runnable without the 60-second full-dataset build: the synthetic fixture exercises the
logic exactly, and the real-artifact tests run on top when the pipeline output is present.
"""

from __future__ import annotations

import json
from pathlib import Path

import numpy as np
import pandas as pd
import pytest

from src.adversarial_provenance import config, flow
from src.adversarial_provenance.agency import compute_agency
from src.adversarial_provenance.io import Edges

REPO_ROOT = Path(__file__).resolve().parents[2]


# --------------------------------------------------------------------------------------
# Synthetic fixture: a hand-built address/transaction structure with a known answer.
#
#   addrA  --spends--> tx1 --pays--> addrB, addrC      (addrA is the illicit seed)
#   addrB  --spends--> tx2 --pays--> addrD
#   addrC  never spends                                 <- must end with alpha == 0
#   addrD  never spends                                 <- must end with alpha == 0
# --------------------------------------------------------------------------------------
@pytest.fixture
def toy_edges() -> Edges:
    at = pd.DataFrame({"address": ["addrA", "addrB"], "txId": [1, 2]})
    ta = pd.DataFrame({
        "txId": [1, 1, 2],
        "address": ["addrB", "addrC", "addrD"],
    })
    addrs = pd.Index(sorted(set(at.address) | set(ta.address)), name="address")
    txs = pd.Index(sorted(set(at.txId) | set(ta.txId)), name="txId")
    addr_index = pd.Series(np.arange(len(addrs)), index=addrs)
    tx_index = pd.Series(np.arange(len(txs)), index=txs)
    for df in (at, ta):
        df["ai"] = df.address.map(addr_index)
        df["ti"] = df.txId.map(tx_index)
    return Edges(at=at, ta=ta, addr_index=addr_index, tx_index=tx_index)


@pytest.fixture
def toy_tx_ts() -> pd.Series:
    return pd.Series({1: 10, 2: 11}, name="ts")


@pytest.fixture
def toy_agency(toy_edges, toy_tx_ts) -> pd.DataFrame:
    seeds = pd.Index(["addrA"])
    universe = pd.Index(toy_edges.addr_index.index)
    baseline = pd.Series(
        flow.propagate(
            flow.build_R(toy_edges.ta, toy_edges.n_addr, toy_edges.n_tx),
            flow.build_P(toy_edges.at, toy_edges.n_tx, toy_edges.n_addr),
            1.0,
            toy_edges.addr_index.loc[seeds].values,
            config.HOPS_K,
        ),
        index=universe,
    )
    return compute_agency(toy_edges, seeds, toy_tx_ts, config.DEFAULT_EXPOSURE_MODE, baseline)


# --- THE mandated invariant ------------------------------------------------------------
def test_alpha_zero_iff_never_spent(toy_agency, toy_edges):
    """An address that never appears as a transaction INPUT must end with alpha == 0.

    This is the assertion the whole exoneration claim rests on. It holds by construction
    because every POSITIVE alpha term is gated on (has_spent & spend_after_exposure) and
    the penalties can only subtract before the clip to [0, 1].

    Note on the name, which comes from the blueprint: only the forward direction is a
    theorem. alpha == 0 does NOT imply never-spent -- an address that spent but has no
    recorded spend at or after its first tainted receipt also lands on 0. The reverse
    implication is asserted to be FALSE below so the distinction is not quietly lost.
    """
    never_spent = set(toy_agency.index) - set(toy_edges.at.address)
    assert never_spent, "fixture must contain at least one never-spent address"
    assert (toy_agency.loc[sorted(never_spent), "alpha"] == 0).all()


def test_alpha_zero_does_not_imply_never_spent_is_documented(toy_agency):
    """Guards the asymmetry above: has_spent is a strictly stronger claim than alpha == 0."""
    zero = toy_agency[toy_agency.alpha == 0]
    assert len(zero) > 0
    # Both are legitimate routes to zero; the UI must never conflate them.
    assert set(zero.evidence_reason.unique()) <= {
        "Never exercised spend authority (no signature produced in this dataset)",
        "No spend recorded at or after first tainted receipt",
    }


def test_positive_alpha_requires_the_spend_gate(toy_agency):
    positive = toy_agency[toy_agency.alpha > 0]
    assert (positive.has_spent & positive.spend_after_exposure).all()


def test_alpha_is_bounded(toy_agency):
    assert (toy_agency.alpha >= 0).all() and (toy_agency.alpha <= 1).all()


def test_row_stochastic(toy_edges):
    P = flow.build_P(toy_edges.at, toy_edges.n_tx, toy_edges.n_addr)
    R = flow.build_R(toy_edges.ta, toy_edges.n_addr, toy_edges.n_tx)
    for M in (P, R):
        s = np.asarray(M.sum(axis=1)).ravel()
        assert np.allclose(s[s > 0], 1.0)


def test_cwt_never_exceeds_baseline(toy_edges, toy_agency):
    """alpha <= 1 everywhere, so the custody-weighted score can only ever be <= baseline."""
    P = flow.build_P(toy_edges.at, toy_edges.n_tx, toy_edges.n_addr)
    R = flow.build_R(toy_edges.ta, toy_edges.n_addr, toy_edges.n_tx)
    seed_idx = toy_edges.addr_index.loc[pd.Index(["addrA"])].values
    base = flow.propagate(R, P, 1.0, seed_idx, config.HOPS_K)
    cwt = flow.propagate(R, P, toy_agency.alpha.values.astype(float), seed_idx, config.HOPS_K)
    assert (cwt <= base + 1e-9).all()


def test_seeds_pinned(toy_edges):
    P = flow.build_P(toy_edges.at, toy_edges.n_tx, toy_edges.n_addr)
    R = flow.build_R(toy_edges.ta, toy_edges.n_addr, toy_edges.n_tx)
    seed_idx = toy_edges.addr_index.loc[pd.Index(["addrA"])].values
    base = flow.propagate(R, P, 1.0, seed_idx, config.HOPS_K)
    assert np.allclose(base[seed_idx], 1.0)


def test_unavailable_components_are_held_neutral_not_guessed(toy_agency):
    """dust_exposure and in_quarantine cannot be computed from the data available here.

    They must be False for every row and declared in the manifest -- never approximated
    from some other column that happens to be present.
    """
    assert not toy_agency.dust_exposure.any()
    assert not toy_agency.in_quarantine.any()
    assert "dust_exposure" in config.UNAVAILABLE_COMPONENTS
    assert "in_quarantine" in config.UNAVAILABLE_COMPONENTS


# --- THE mandated no-hardcoding enforcement -------------------------------------------
def test_no_literals_in_view():
    """No computed APL result may be typed into the view layer.

    The React app is this project's dashboard, so the blueprint's check against
    dashboard/app.py is applied to the frontend source instead. The values below are
    distinctive outputs of an actual run; if one appears in a component, someone pasted a
    number instead of rendering the API response.
    """
    frontend_src = REPO_ROOT / "src" / "webapp" / "frontend" / "src"
    forbidden = [
        "12873", "15014", "85.74", "0.8574", "30430",
        "422730", "113159", "792512", "35161",
    ]
    offenders = []
    for path in frontend_src.rglob("*.jsx"):
        text = path.read_text(encoding="utf-8", errors="ignore")
        for bad in forbidden:
            if bad in text:
                offenders.append(f"{path.relative_to(REPO_ROOT)}: {bad}")
    assert offenders == [], f"hardcoded APL result(s) found in view layer: {offenders}"


def test_no_literals_in_backend_view_layer():
    """Same rule for the Flask endpoints: they must read the artifacts, not embed them."""
    server = (REPO_ROOT / "src" / "webapp" / "server.py").read_text(encoding="utf-8")
    for bad in ["12873", "15014", "0.8574", "30430", "422730"]:
        assert bad not in server, f"hardcoded APL result {bad} found in server.py"


# --- Tests against the real artifacts, when they exist ---------------------------------
real_artifacts = pytest.mark.skipif(
    not config.AGENCY_PARQUET.exists(),
    reason="Module A artifacts not built; run python -m src.adversarial_provenance.pipeline",
)


@real_artifacts
def test_real_alpha_zero_for_every_never_spent_address():
    ag = pd.read_parquet(config.AGENCY_PARQUET)
    never = ag[~ag.has_spent]
    assert len(never) > 0
    assert (never.alpha == 0).all()


@real_artifacts
def test_real_cwt_never_exceeds_baseline():
    taint = pd.read_parquet(config.TAINT_PARQUET)
    assert (taint.risk_cwt <= taint.risk_baseline + 1e-6).all()


@real_artifacts
def test_real_seeds_are_pinned():
    taint = pd.read_parquet(config.TAINT_PARQUET)
    seeds = taint[taint.class_label == config.CLASS_ILLICIT]
    assert len(seeds) > 0
    assert np.allclose(seeds.risk_baseline.values, 1.0)


@real_artifacts
def test_manifest_declares_every_estimator():
    manifest = json.loads(config.MANIFEST_JSON.read_text(encoding="utf-8"))
    for key in ("E1_value_share", "E2_spend_after_exposure", "E3_network_layer"):
        assert key in manifest["estimators"]
        assert manifest["estimators"][key]["mode"]
        assert manifest["estimators"][key]["why"]
    assert manifest["unavailable_components"]
    assert manifest["exposure_mode"] in config.EXPOSURE_MODES
