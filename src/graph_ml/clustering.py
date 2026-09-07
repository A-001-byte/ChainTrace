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


def kick_down_doors(
    graph: nx.Graph,
    flagged_node_ids: list[str],
    top_n: int = 10,
) -> list[dict[str, float | str | int | bool]]:
    """Kick Down Doors USP: Betweenness centrality & articulation point analysis.

    Identifies high-leverage target nodes whose removal maximally disconnects or disrupts
    the money-flow pathways among flagged entities and their immediate neighborhood.

    Args:
        graph: The NetworkX graph.
        flagged_node_ids: List of flagged node IDs (e.g. top alert entities).
        top_n: Maximum number of high-leverage nodes to return.

    Returns:
        List of dicts ordered by impact score descending, containing:
            - node_id: str
            - node_type: str ("tx" or "wallet")
            - betweenness: float
            - is_articulation_point: bool
            - cluster_id: int | None
            - label: str
            - impact_score: float
            - reason: str
    """
    valid_flagged = [n for n in flagged_node_ids if graph.has_node(n)]
    if not valid_flagged:
        logger.warning("No valid flagged nodes found in graph for Kick Down Doors analysis.")
        return []

    # Build local subgraph including flagged nodes and their immediate 1-hop neighbors
    neighborhood = set(valid_flagged)
    for node in valid_flagged:
        neighborhood.update(graph.neighbors(node))

    subgraph = graph.subgraph(neighborhood).copy()
    if subgraph.number_of_nodes() == 0:
        return []

    undirected_subgraph = subgraph.to_undirected()

    # Calculate network metrics
    betweenness_map = nx.betweenness_centrality(undirected_subgraph)
    articulation_points = set(nx.articulation_points(undirected_subgraph))

    results = []
    for node in subgraph.nodes():
        attrs = subgraph.nodes[node]
        node_type = attrs.get("node_type", "tx" if node.startswith("tx_") else "wallet")
        b_score = float(betweenness_map.get(node, 0.0))
        is_ap = node in articulation_points
        degree = subgraph.degree(node)

        # Impact score combines centrality, articulation status, and degree weight
        ap_multiplier = 1.5 if is_ap else 1.0
        degree_weight = degree / max(subgraph.number_of_nodes(), 1)
        impact_score = round(b_score * ap_multiplier + degree_weight * 0.5, 4)

        reasons = []
        if is_ap:
            reasons.append("Articulation Point (single point of failure)")
        if b_score > 0.1:
            reasons.append(f"High Centrality ({b_score:.3f})")
        if degree > 3:
            reasons.append(f"High Connectivity (degree {degree})")
        if not reasons:
            reasons.append("Network Bridge")

        reason_str = "; ".join(reasons)

        results.append({
            "node_id": node,
            "node_type": node_type,
            "betweenness": round(b_score, 4),
            "is_articulation_point": is_ap,
            "cluster_id": attrs.get("cluster"),
            "label": attrs.get("label", "unknown"),
            "impact_score": impact_score,
            "reason": reason_str,
        })

    results.sort(key=lambda x: x["impact_score"], reverse=True)
    return results[:top_n]

