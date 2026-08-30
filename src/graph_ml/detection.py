"""ML detection layer (Section 4, step 4): a Random Forest classifier trained on Elliptic's
labeled illicit/licit subset, plus an Isolation Forest anomaly detector run over the full
feature set — exactly the two-model design in the blueprint (Section 7).

Tx nodes and wallet nodes live in the same graph but have disjoint feature spaces (tx
features vs wallet features), so each node type is scored with its own model instance —
call score_node_type() once per type present in the graph, then risk_scoring merges the
results into one ranked list.
"""

from __future__ import annotations

import logging
from dataclasses import dataclass

import networkx as nx
import numpy as np
import pandas as pd
from sklearn.ensemble import IsolationForest, RandomForestClassifier
from sklearn.model_selection import train_test_split

from .config import ANOMALY_CONTAMINATION, RANDOM_STATE

logger = logging.getLogger(__name__)


@dataclass
class DetectionResult:
    node_type: str
    feature_names: list[str]
    illicit_probability: dict[str, float]   # node_id -> RF predicted P(illicit)
    anomaly_score: dict[str, float]          # node_id -> normalized anomaly score, higher = more anomalous
    classifier: RandomForestClassifier
    anomaly_model: IsolationForest
    holdout_accuracy: float
    holdout_f1_illicit: float


def feature_matrix(graph: nx.Graph, node_type: str, feature_prefix: str) -> tuple[list[str], pd.DataFrame]:
    """Extract (node_ids, feature_dataframe) for all nodes of the given type.

    Public so pipeline.py can build it once and hand the same frame to both
    score_node_type() and explainability (percentile lookups need the full population).
    """
    node_ids = [n for n, d in graph.nodes(data=True) if d.get("node_type") == node_type]
    records = []
    for node_id in node_ids:
        attrs = graph.nodes[node_id]
        records.append({k: v for k, v in attrs.items() if k.startswith(feature_prefix)})
    df = pd.DataFrame.from_records(records, index=node_ids).fillna(0.0)
    return node_ids, df


def score_node_type(graph: nx.Graph, node_type: str, feature_prefix: str = "feat_") -> DetectionResult:
    """Train RF on labeled nodes of this type, predict on all; run Isolation Forest on all.

    Args:
        graph: the built entity-transaction graph (see graph_builder).
        node_type: "tx" or "wallet".
        feature_prefix: column prefix identifying this node type's feature columns
            ("feat_" for tx nodes, "wallet_feat" is namespaced per graph_builder — pass the
            exact prefix used there, e.g. "wallet_" for wallet nodes).
    """
    node_ids, features = feature_matrix(graph, node_type, feature_prefix)
    if not node_ids:
        raise ValueError(f"No nodes of type '{node_type}' found in graph")

    labels = pd.Series(
        [graph.nodes[n].get("label", "unknown") for n in node_ids], index=node_ids
    )
    labeled_mask = labels.isin(["illicit", "licit"])

    X_all = features.values
    feature_names = list(features.columns)

    if labeled_mask.sum() < 10:
        logger.warning(
            "Only %d labeled '%s' nodes — too few to train a classifier; "
            "illicit_probability will default to 0.0 for all nodes",
            labeled_mask.sum(), node_type,
        )
        classifier = RandomForestClassifier(random_state=RANDOM_STATE)
        illicit_probability = {n: 0.0 for n in node_ids}
        holdout_accuracy = holdout_f1 = float("nan")
    else:
        X_labeled = features.loc[labeled_mask].values
        y_labeled = (labels.loc[labeled_mask] == "illicit").astype(int).values

        X_train, X_test, y_train, y_test = train_test_split(
            X_labeled, y_labeled, test_size=0.2, random_state=RANDOM_STATE, stratify=y_labeled
        )
        # n_jobs left at the default (1, no joblib multiprocessing): this dataset size trains
        # in seconds single-threaded, and joblib's spawned subprocesses can hang in sandboxed
        # Windows shells (observed in this dev environment) for no real speed benefit here.
        classifier = RandomForestClassifier(
            n_estimators=200, random_state=RANDOM_STATE, class_weight="balanced"
        )
        classifier.fit(X_train, y_train)

        from sklearn.metrics import accuracy_score, f1_score

        y_pred = classifier.predict(X_test)
        holdout_accuracy = accuracy_score(y_test, y_pred)
        holdout_f1 = f1_score(y_test, y_pred, zero_division=0)
        logger.info(
            "%s classifier holdout: accuracy=%.3f, f1(illicit)=%.3f",
            node_type, holdout_accuracy, holdout_f1,
        )

        # Refit on all labeled data (train+test) before predicting on the full set.
        classifier.fit(X_labeled, y_labeled)
        proba_all = classifier.predict_proba(X_all)[:, list(classifier.classes_).index(1)]
        illicit_probability = dict(zip(node_ids, proba_all))

    anomaly_model = IsolationForest(
        n_estimators=200, contamination=ANOMALY_CONTAMINATION, random_state=RANDOM_STATE
    )
    anomaly_model.fit(X_all)
    # decision_function: higher = more normal. Flip and min-max normalize to [0, 1], higher = more anomalous.
    raw_scores = -anomaly_model.decision_function(X_all)
    min_s, max_s = raw_scores.min(), raw_scores.max()
    normalized = (raw_scores - min_s) / (max_s - min_s) if max_s > min_s else np.zeros_like(raw_scores)
    anomaly_score = dict(zip(node_ids, normalized))

    return DetectionResult(
        node_type=node_type,
        feature_names=feature_names,
        illicit_probability=illicit_probability,
        anomaly_score=anomaly_score,
        classifier=classifier,
        anomaly_model=anomaly_model,
        holdout_accuracy=holdout_accuracy,
        holdout_f1_illicit=holdout_f1,
    )
