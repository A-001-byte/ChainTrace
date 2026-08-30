"""Combines classifier confidence + anomaly score + cluster membership into one ranked
risk score per node (Section 4, step 6), and produces the final ranked alert list that
Phase 3's dashboard consumes.
"""

from __future__ import annotations

import logging

import networkx as nx
import pandas as pd

from .clustering import illicit_ratio_per_cluster
from .config import RISK_WEIGHT_ANOMALY, RISK_WEIGHT_CLASSIFIER, TOP_N_ALERTS
from .detection import DetectionResult
from .explainability import explain_cluster_membership, explain_node

logger = logging.getLogger(__name__)

# Small extra weight given to the cluster signal on top of the classifier+anomaly blend.
# Kept separate (additive, capped) rather than folded into the main weights so a node in an
# all-illicit cluster can't alone push the score to 1.0 without classifier/anomaly agreement.
CLUSTER_RISK_BONUS = 0.15


def build_ranked_alerts(
    graph: nx.Graph,
    detection_results: list[DetectionResult],
    feature_frames: dict[str, pd.DataFrame],
    top_n: int = TOP_N_ALERTS,
) -> pd.DataFrame:
    """Produce the ranked alert list — the Phase 2 checkpoint deliverable.

    Args:
        graph: graph with "cluster" node attribute already set (see clustering.detect_communities).
        detection_results: one DetectionResult per node type scored (see detection.score_node_type).
        feature_frames: node_type -> feature DataFrame, same one passed into score_node_type,
            reused here so explainability can compute percentiles without recomputing.
        top_n: how many top-ranked alerts to return.

    Returns:
        DataFrame sorted by risk_score descending, columns:
        node_id, node_type, label, cluster_id, classifier_confidence, anomaly_score,
        risk_score, reason
    """
    cluster_ratios = illicit_ratio_per_cluster(graph)
    rows = []

    # Pass 1 — score every node (cheap: dict lookups + arithmetic). Explanations are
    # deferred to pass 2, computed only for the rows that survive the top_n cut: explain_node
    # does an O(n) percentile scan per feature, so running it for every node instead of just
    # the alerts we keep turned this into an O(n^2) bottleneck at Elliptic's scale.
    for result in detection_results:
        for node_id in result.illicit_probability:
            attrs = graph.nodes[node_id]
            classifier_confidence = result.illicit_probability[node_id]
            anomaly = result.anomaly_score[node_id]
            cluster_id = attrs.get("cluster")
            cluster_ratio = cluster_ratios.get(cluster_id, 0.0)

            base_score = (
                RISK_WEIGHT_CLASSIFIER * classifier_confidence + RISK_WEIGHT_ANOMALY * anomaly
            )
            risk_score = min(1.0, base_score + CLUSTER_RISK_BONUS * cluster_ratio)

            rows.append(
                {
                    "node_id": node_id,
                    "node_type": result.node_type,
                    "label": attrs.get("label", "unknown"),
                    "cluster_id": cluster_id,
                    "cluster_ratio": cluster_ratio,
                    "classifier_confidence": round(classifier_confidence, 4),
                    "anomaly_score": round(anomaly, 4),
                    "risk_score": round(risk_score, 4),
                }
            )

    all_alerts = pd.DataFrame(rows).sort_values("risk_score", ascending=False).reset_index(drop=True)
    logger.info("Scored %d total nodes, explaining top %d", len(all_alerts), min(top_n, len(all_alerts)))
    top_alerts = all_alerts.head(top_n).copy()

    results_by_type = {r.node_type: r for r in detection_results}
    reasons = []
    for row in top_alerts.itertuples(index=False):
        result = results_by_type[row.node_type]
        features = feature_frames[row.node_type]
        reason_parts = [explain_node(row.node_id, features, result.classifier)]
        cluster_reason = explain_cluster_membership(row.cluster_ratio)
        if cluster_reason:
            reason_parts.append(cluster_reason)
        reasons.append("; ".join(reason_parts))

    top_alerts["reason"] = reasons
    return top_alerts.drop(columns=["cluster_ratio"])
