"""Module B — Cluster Fragility Index.

The architectural point (blueprint §3.1): do NOT build a co-spend clique graph. A
transaction with 1,000 inputs would generate 499,500 edges. Use the bipartite
address-transaction graph directly, where three things fall out for free:

  1. Connected components restricted to address nodes ARE the multi-input-heuristic
     clusters. Asserted against an independent union-find in the test suite.
  2. A TRANSACTION node that is an articulation point is exactly a single-witness merge:
     one unreplicated co-spend holding two fragments of an "entity" together.
  3. Edge count is |AddrTx|, linear rather than O(sum of indegree^2).

CFI(C) = min(1, sum over transaction-node articulation points v of merge_load(v)), where
merge_load(v) is the fraction of C's addresses that detach from the largest remaining
fragment when v is removed.

    CFI = 0     every address in this entity is witnessed by >= 2 independent transactions
    CFI = 0.41  41% of this "entity" exists only because of single, unreplicated merges
"""

from __future__ import annotations

import logging

import networkx as nx
import numpy as np
import pandas as pd

logger = logging.getLogger(__name__)

ADDR_PREFIX = "a"
TX_PREFIX = "t"

# Escape hatch from the blueprint. Components above this get cfi = NaN and
# cfi_status = SKIPPED_OVERSIZE, rendered as "not computed" and NEVER as zero.
MAX_COMPONENT_SIZE = 50_000
MIN_CLUSTER_ADDRESSES = 3   # below this a cluster is trivially non-fragile


def build_bipartite(at: pd.DataFrame) -> nx.Graph:
    """Bipartite address-transaction graph from the INPUT side (AddrTx) only.

    Inputs are what the multi-input heuristic clusters on: two addresses funding the same
    transaction are asserted to share a wallet. Output edges would merge unrelated
    recipients and are deliberately excluded.
    """
    B = nx.Graph()
    B.add_edges_from(
        zip(
            (ADDR_PREFIX + at.ai.astype(str)).to_numpy(),
            (TX_PREFIX + at.ti.astype(str)).to_numpy(),
        )
    )
    return B


def clusters_from_bipartite(B: nx.Graph) -> pd.DataFrame:
    """Address -> cluster_id, from connected components restricted to address nodes."""
    rows = []
    for cid, comp in enumerate(nx.connected_components(B)):
        for n in comp:
            if n[0] == ADDR_PREFIX:
                rows.append((int(n[1:]), cid))
    return pd.DataFrame(rows, columns=["ai", "cluster_id"])


def cluster_fragility(sub: nx.Graph) -> tuple[float, list[dict], str]:
    """CFI for one component subgraph. Returns (cfi, fragile_records, status)."""
    addr_nodes = {n for n in sub if n[0] == ADDR_PREFIX}
    n_addr = len(addr_nodes)

    if n_addr < MIN_CLUSTER_ADDRESSES:
        return 0.0, [], "TRIVIAL"
    if sub.number_of_nodes() > MAX_COMPONENT_SIZE:
        return float("nan"), [], "SKIPPED_OVERSIZE"

    fragile: list[dict] = []
    for v in nx.articulation_points(sub):
        if v[0] != TX_PREFIX:
            continue  # only TRANSACTION cut vertices are merges
        # Subgraph view over the remaining nodes: no full graph copy per cut vertex.
        remaining = [n for n in sub if n != v]
        parts = [
            len({n for n in c if n[0] == ADDR_PREFIX})
            for c in nx.connected_components(sub.subgraph(remaining))
        ]
        parts = sorted((p for p in parts if p > 0), reverse=True)
        if len(parts) < 2:
            continue
        fragile.append({
            "tx_node": v,
            "merge_load": sum(parts[1:]) / n_addr,
            "split_sizes": parts,
            # An articulation point is single-witness by construction: if a second
            # transaction independently linked the fragments, removing this one could not
            # disconnect them. Stored explicitly so there is a column to point at.
            "n_witnesses": 1,
        })

    cfi = min(1.0, sum(f["merge_load"] for f in fragile))
    return cfi, fragile, "OK"


def cluster_fragility_fast(sub: nx.Graph) -> tuple[float, list[dict], str]:
    """Same CFI, computed in one O(V+E) DFS instead of one graph traversal per cut vertex.

    This is the blueprint's named upgrade path, and it was necessary rather than optional:
    the naive remove-and-recount loop measured 102s on this dataset's largest component
    alone, which extrapolates to hours across 146,783 components.

    Standard Tarjan articulation-point DFS, carrying two extra quantities:
      addr_cnt[v]  addresses in v's DFS subtree
      detached[v]  for each child c with low[c] >= disc[v], addr_cnt[c] -- exactly the
                   fragments that fall off when v is removed

    Removing a non-root v splits the cluster into those detached subtrees plus everything
    else; removing the root splits it into precisely its child subtrees. merge_load is then
    the share that is NOT in the largest surviving fragment, identical to the naive
    definition. Iterative because a 16k-node component would overflow the recursion limit.

    Verified equal to cluster_fragility() on real components -- see the test suite.
    """
    addr_nodes = {n for n in sub if n[0] == ADDR_PREFIX}
    n_addr = len(addr_nodes)
    if n_addr < MIN_CLUSTER_ADDRESSES:
        return 0.0, [], "TRIVIAL"
    if sub.number_of_nodes() > MAX_COMPONENT_SIZE:
        return float("nan"), [], "SKIPPED_OVERSIZE"

    nodes = list(sub.nodes())
    index = {n: i for i, n in enumerate(nodes)}
    n = len(nodes)
    adj = [[index[m] for m in sub[node]] for node in nodes]
    is_addr = [node[0] == ADDR_PREFIX for node in nodes]

    disc = [-1] * n
    low = [0] * n
    addr_cnt = [0] * n
    detached: list[list[int]] = [[] for _ in range(n)]
    root_children = 0
    timer = 0
    root = 0

    disc[root] = low[root] = timer
    timer += 1
    addr_cnt[root] = 1 if is_addr[root] else 0
    stack = [(root, -1, iter(adj[root]))]

    while stack:
        v, parent, it = stack[-1]
        advanced = False
        for w in it:
            if w == parent:
                continue
            if disc[w] == -1:
                disc[w] = low[w] = timer
                timer += 1
                addr_cnt[w] = 1 if is_addr[w] else 0
                stack.append((w, v, iter(adj[w])))
                advanced = True
                break
            low[v] = min(low[v], disc[w])
        if advanced:
            continue

        stack.pop()
        if stack:
            p = stack[-1][0]
            low[p] = min(low[p], low[v])
            addr_cnt[p] += addr_cnt[v]
            if p == root:
                root_children += 1
                detached[p].append(addr_cnt[v])
            elif low[v] >= disc[p]:
                detached[p].append(addr_cnt[v])

    fragile: list[dict] = []
    for i, node in enumerate(nodes):
        if node[0] != TX_PREFIX or not detached[i]:
            continue
        if i == root:
            if root_children < 2:
                continue          # root is only a cut vertex when it has >= 2 children
            parts = list(detached[i])
        else:
            rest = n_addr - sum(detached[i])
            parts = list(detached[i]) + [rest]
        parts = sorted((p for p in parts if p > 0), reverse=True)
        if len(parts) < 2:
            continue
        fragile.append({
            "tx_node": node,
            "merge_load": sum(parts[1:]) / n_addr,
            "split_sizes": parts,
            "n_witnesses": 1,
        })

    cfi = min(1.0, sum(f["merge_load"] for f in fragile))
    return cfi, fragile, "OK"


def compute_all(B: nx.Graph, progress_every: int = 20_000) -> tuple[pd.DataFrame, pd.DataFrame]:
    """CFI over every component. Returns (cfi_table, fragile_edges_table)."""
    cfi_rows, frag_rows = [], []
    for cid, comp in enumerate(nx.connected_components(B)):
        sub = B.subgraph(comp)
        n_addr = sum(1 for n in comp if n[0] == ADDR_PREFIX)
        n_tx = sum(1 for n in comp if n[0] == TX_PREFIX)
        cfi, fragile, status = cluster_fragility_fast(sub)
        cfi_rows.append({
            "cluster_id": cid, "n_addr": n_addr, "n_tx": n_tx,
            "n_fragile_tx": len(fragile), "cfi": cfi, "cfi_status": status,
        })
        for f in fragile:
            frag_rows.append({
                "cluster_id": cid,
                "ti": int(f["tx_node"][1:]),
                "merge_load": f["merge_load"],
                "split_sizes": f["split_sizes"],
                "n_witnesses": f["n_witnesses"],
            })
        if progress_every and (cid + 1) % progress_every == 0:
            logger.info("  ...%d components scored", cid + 1)

    return pd.DataFrame(cfi_rows), pd.DataFrame(
        frag_rows, columns=["cluster_id", "ti", "merge_load", "split_sizes", "n_witnesses"]
    )


def union_find_multi_input(at: pd.DataFrame) -> dict[int, int]:
    """INDEPENDENT reference implementation of the classic multi-input heuristic.

    Plain disjoint-set union over each transaction's input group -- no bipartite graph, no
    networkx. Exists so the test suite can assert that the bipartite reformulation is an
    exact restatement of the industry-standard clustering rather than a convenient
    approximation. This is the credibility test.
    """
    parent: dict[int, int] = {}

    def find(x: int) -> int:
        parent.setdefault(x, x)
        root = x
        while parent[root] != root:
            root = parent[root]
        while parent[x] != root:      # path compression
            parent[x], x = root, parent[x]
        return root

    def union(a: int, b: int) -> None:
        ra, rb = find(a), find(b)
        if ra != rb:
            parent[ra] = rb

    for _, group in at.groupby("ti", sort=False)["ai"]:
        vals = group.to_numpy()
        first = int(vals[0])
        find(first)
        for other in vals[1:]:
            union(first, int(other))

    return {a: find(a) for a in parent}


def partitions_equal(labels_a: dict[int, int], labels_b: dict[int, int]) -> bool:
    """True iff two labelings induce the same partition (label values may differ)."""
    if set(labels_a) != set(labels_b):
        return False
    groups_a: dict[int, set[int]] = {}
    groups_b: dict[int, set[int]] = {}
    for k, v in labels_a.items():
        groups_a.setdefault(v, set()).add(k)
    for k, v in labels_b.items():
        groups_b.setdefault(v, set()).add(k)
    return {frozenset(s) for s in groups_a.values()} == {frozenset(s) for s in groups_b.values()}
