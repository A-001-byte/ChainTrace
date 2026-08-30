"""Entity clustering via Louvain community detection (Section 4, step 3).

Groups wallets/transactions into clusters of nodes likely controlled by, or transacting
tightly with, the same real-world actor. Cluster membership feeds into risk_scoring as one
more signal ("this node sits in a cluster with N known-illicit members").
"""

from __future__ import annotations

import logging

import networkx as nx

from .config import RANDOM_STATE

logger = logging.getLogger(__name__)


def detect_communities(graph: nx.Graph) -> dict[str, int]:
    """Run Louvain community detection.

    Returns:
        node_id -> cluster_id mapping (also written back onto the graph as node attr "cluster").
    """
    if graph.number_of_edges() == 0:
        logger.warning("Graph has no edges; every node becomes its own cluster")
        cluster_map = {node: i for i, node in enumerate(graph.nodes())}
    else:
        communities = nx.community.louvain_communities(graph, seed=RANDOM_STATE)
        cluster_map = {}
        for cluster_id, community in enumerate(communities):
            for node in community:
                cluster_map[node] = cluster_id

    nx.set_node_attributes(graph, cluster_map, name="cluster")
    logger.info("Detected %d communities", len(set(cluster_map.values())))
    return cluster_map


def illicit_ratio_per_cluster(graph: nx.Graph) -> dict[int, float]:
    """For each cluster, the fraction of its labeled members (illicit+licit, excluding
    unknown) that are illicit. Used both as a risk signal and as an explanation ("this
    node's cluster is 73% illicit-labeled").
    """
    cluster_counts: dict[int, dict[str, int]] = {}
    for _, attrs in graph.nodes(data=True):
        cluster_id = attrs.get("cluster")
        label = attrs.get("label", "unknown")
        if cluster_id is None or label == "unknown":
            continue
        bucket = cluster_counts.setdefault(cluster_id, {"illicit": 0, "licit": 0})
        bucket[label] = bucket.get(label, 0) + 1

    ratios = {}
    for cluster_id, counts in cluster_counts.items():
        total = counts.get("illicit", 0) + counts.get("licit", 0)
        ratios[cluster_id] = counts.get("illicit", 0) / total if total > 0 else 0.0
    return ratios
