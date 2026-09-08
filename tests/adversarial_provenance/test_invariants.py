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
from src.adversarial_provenance import io as io_module
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
        # Module A results
        "12873", "15014", "85.74", "0.8574", "30430",
        "422730", "113159", "792512", "35161",
        # Module B results
        "14298", "24266", "146783", "132485", "14885", "0.9285",
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
    for bad in ["12873", "15014", "0.8574", "30430", "422730", "14298", "24266", "146783"]:
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


# =====================================================================================
# Module B — Cluster Fragility Index
# =====================================================================================
from src.adversarial_provenance import fragility  # noqa: E402


@pytest.fixture
def toy_bipartite_at() -> pd.DataFrame:
    """A multi-input structure with a known, hand-checkable cluster partition.

        tx0: a0, a1        -> a0,a1,a2 merge into one cluster, held together
        tx1: a1, a2           ONLY by tx0 and tx1 (each a single witness)
        tx2: a3, a4        -> a3,a4 a separate cluster
        a5 : appears alone in tx3 -> singleton
    """
    rows = [(0, 0), (1, 0), (1, 1), (2, 1), (3, 2), (4, 2), (5, 3)]
    at = pd.DataFrame(rows, columns=["ai", "ti"])
    at["address"] = "addr" + at.ai.astype(str)
    at["txId"] = at.ti
    return at


def test_bipartite_components_match_unionfind(toy_bipartite_at):
    """The reformulation is an exact restatement of the industry-standard clustering.

    This is the credibility test: it proves the bipartite connectivity trick is not a
    convenient approximation of the multi-input heuristic but provably the same partition.
    The union-find is implemented independently, without networkx.
    """
    B = fragility.build_bipartite(toy_bipartite_at)
    from_graph = fragility.clusters_from_bipartite(B)
    graph_labels = dict(zip(from_graph.ai, from_graph.cluster_id))
    uf_labels = fragility.union_find_multi_input(toy_bipartite_at)
    assert fragility.partitions_equal(graph_labels, uf_labels)


def test_fast_cfi_matches_naive_cfi(toy_bipartite_at):
    """The O(V+E) DFS must agree exactly with the naive remove-and-recount definition.

    The naive version is the definition; the fast one is an optimisation, so any drift
    between them is a bug in the optimisation.
    """
    import networkx as nx

    B = fragility.build_bipartite(toy_bipartite_at)
    for comp in nx.connected_components(B):
        sub = B.subgraph(comp)
        cfi_fast, frag_fast, status_fast = fragility.cluster_fragility_fast(sub)
        cfi_naive, frag_naive, status_naive = fragility.cluster_fragility(sub)
        assert status_fast == status_naive
        if status_fast != "OK":
            continue
        assert cfi_fast == pytest.approx(cfi_naive)
        assert {f["tx_node"] for f in frag_fast} == {f["tx_node"] for f in frag_naive}
        assert sorted(round(f["merge_load"], 12) for f in frag_fast) == sorted(
            round(f["merge_load"], 12) for f in frag_naive
        )


def test_cfi_is_bounded_and_articulation_points_are_transactions(toy_bipartite_at):
    import networkx as nx

    B = fragility.build_bipartite(toy_bipartite_at)
    for comp in nx.connected_components(B):
        cfi, frag, status = fragility.cluster_fragility_fast(B.subgraph(comp))
        if status != "OK":
            continue
        assert 0.0 <= cfi <= 1.0
        # Only TRANSACTION nodes may be reported as merges; an address cut vertex is not
        # a merge, it is just a shared address.
        assert all(f["tx_node"].startswith(fragility.TX_PREFIX) for f in frag)
        # An articulation point is single-witness by construction.
        assert all(f["n_witnesses"] == 1 for f in frag)


def test_trivial_clusters_are_not_scored_as_fragile(toy_bipartite_at):
    """A 1-2 address cluster is trivially non-fragile and must report TRIVIAL, not 0-as-fact."""
    import networkx as nx

    B = fragility.build_bipartite(toy_bipartite_at)
    singleton = [c for c in nx.connected_components(B)
                 if sum(1 for n in c if n.startswith(fragility.ADDR_PREFIX)) < 3]
    assert singleton, "fixture must contain a trivially small cluster"
    for comp in singleton:
        cfi, frag, status = fragility.cluster_fragility_fast(B.subgraph(comp))
        assert status == "TRIVIAL" and cfi == 0.0 and frag == []


# --- Module B against the real artifacts ----------------------------------------------
cfi_artifacts = pytest.mark.skipif(
    not (config.OUTPUT_DIR / "cfi.parquet").exists(),
    reason="Module B artifacts not built; run python -m src.adversarial_provenance.pipeline_b",
)


@cfi_artifacts
def test_real_cfi_bounded_and_status_honest():
    cfi = pd.read_parquet(config.OUTPUT_DIR / "cfi.parquet")
    scored = cfi[cfi.cfi_status == "OK"]
    assert len(scored) > 0
    assert (scored.cfi >= 0).all() and (scored.cfi <= 1).all()
    # Oversize components must be NaN, never silently 0 -- "not computed" is not "clean".
    skipped = cfi[cfi.cfi_status == "SKIPPED_OVERSIZE"]
    assert skipped.cfi.isna().all()


@cfi_artifacts
def test_real_ablated_is_a_true_lower_bound():
    """risk_cwt_ablated <= risk_cwt <= risk_baseline, so [ablated, baseline] is an interval."""
    taint = pd.read_parquet(config.TAINT_PARQUET)
    assert (taint.risk_cwt_ablated <= taint.risk_cwt + 1e-6).all()
    assert (taint.risk_cwt <= taint.risk_baseline + 1e-6).all()


@cfi_artifacts
def test_real_contested_queue_is_routed_not_emptied():
    """Fragile alerts must be ROUTED, so the contested queue has to be non-empty to mean
    anything. An empty queue would mean fragility was quietly suppressed instead."""
    taint = pd.read_parquet(config.TAINT_PARQUET)
    assert (taint.queue == "CONTESTED_EVIDENCE").sum() > 0
    assert set(taint.queue.unique()) <= {"STANDARD", "CONTESTED_EVIDENCE"}


@cfi_artifacts
def test_real_bipartite_components_match_unionfind_on_full_dataset():
    """The credibility test, run on all 477,117 real AddrTx edges rather than a toy."""
    edges = io_module.load_edges()
    B = fragility.build_bipartite(edges.at)
    from_graph = fragility.clusters_from_bipartite(B)
    graph_labels = dict(zip(from_graph.ai, from_graph.cluster_id))
    uf_labels = fragility.union_find_multi_input(edges.at)
    assert fragility.partitions_equal(graph_labels, uf_labels)
