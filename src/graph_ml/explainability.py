"""Explainability layer (Section 4, step 5): turns a flagged node's raw feature values +
the classifier's global feature importances into a short, human-readable "why flagged" reason.

Approach: for each flagged node, take the classifier's globally most important features,
rank that node's own values on those features (via percentile within the full population),
and surface the ones where the node sits at an extreme — this reads as instance-specific
even though it's built on global (not per-instance/SHAP) importances. SHAP is the documented
stretch upgrade (Section 7) if time allows; this is the fast, defensible baseline.
"""

from __future__ import annotations

import logging

import numpy as np
import pandas as pd
from sklearn.ensemble import RandomForestClassifier

from .config import TOP_K_FEATURES_FOR_EXPLANATION

logger = logging.getLogger(__name__)

# Elliptic feature indices are anonymized (feat_0, feat_1, ...) — there's no public
# human-readable name mapping, so we label by rank instead of pretending we know what
# "feat_47" means. This is honest and still useful: "unusually high value on the #2 most
# predictive feature for this model" is a real, defensible explanation.


def top_global_features(classifier: RandomForestClassifier, feature_names: list[str], top_k: int = 10) -> list[str]:
    """The classifier's globally most important features, most important first."""
    importances = classifier.feature_importances_
    order = np.argsort(importances)[::-1][:top_k]
    return [feature_names[i] for i in order]


def explain_node(
    node_id: str,
    features: pd.DataFrame,
    classifier: RandomForestClassifier,
    top_k: int = TOP_K_FEATURES_FOR_EXPLANATION,
) -> str:
    """Build a "why flagged" string for one node.

    Args:
        node_id: the node to explain.
        features: the full feature DataFrame used to train/score this node type
            (index = node_id, columns = feature names) — needed to compute percentiles.
        classifier: the fitted RandomForestClassifier for this node type.
        top_k: how many contributing features to mention.
    """
    if node_id not in features.index:
        return "No feature data available for this node."

    important_features = top_global_features(classifier, list(features.columns), top_k=top_k * 2)
    node_row = features.loc[node_id]

    reasons = []
    for feat_name in important_features:
        if len(reasons) >= top_k:
            break
        value = node_row[feat_name]
        percentile = (features[feat_name] <= value).mean() * 100
        if percentile >= 90:
            reasons.append(f"{feat_name} is in the top {100 - percentile:.0f}% of all nodes (high)")
        elif percentile <= 10:
            reasons.append(f"{feat_name} is in the bottom {percentile:.0f}% of all nodes (low)")
        # else: this node isn't extreme on this feature — skip it, not every top feature is informative per-node

    if not reasons:
        top_feat = important_features[0] if important_features else "top model feature"
        reasons.append(f"driven primarily by {top_feat} (no single extreme value, broad pattern match)")

    return "; ".join(reasons)


def explain_cluster_membership(cluster_illicit_ratio: float) -> str | None:
    """Optional extra reason line when a node's cluster is itself risky."""
    if cluster_illicit_ratio >= 0.5:
        return f"belongs to a cluster that is {cluster_illicit_ratio * 100:.0f}% illicit-labeled among known members"
    return None
