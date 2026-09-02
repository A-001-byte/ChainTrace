"""Fixtures for src/webapp tests: tiny synthetic ranked_alerts.csv / unified_dataset.csv
so tests run fast and don't depend on the real ~87MB/~10KB pipeline outputs being present.
"""

from __future__ import annotations

import pandas as pd
import pytest

from src.webapp import server as server_module


@pytest.fixture
def alerts_csv(tmp_path):
    path = tmp_path / "ranked_alerts.csv"
    pd.DataFrame(
        [
            {
                "node_id": "wallet_AAA",
                "node_type": "wallet",
                "label": "illicit",
                "cluster_id": 5,
                "classifier_confidence": 0.95,
                "anomaly_score": 0.6,
                "risk_score": 0.91,
                "reason": "high fees",
            },
            {
                "node_id": "tx_123",
                "node_type": "tx",
                "label": "unknown",
                "cluster_id": 5,
                "classifier_confidence": 0.4,
                "anomaly_score": 0.5,
                "risk_score": 0.55,
                "reason": "moderate anomaly",
            },
            {
                "node_id": "wallet_BBB",
                "node_type": "wallet",
                "label": "licit",
                "cluster_id": 9,
                "classifier_confidence": 0.1,
                "anomaly_score": 0.2,
                "risk_score": 0.2,
                "reason": "nothing notable",
            },
        ]
    ).to_csv(path, index=False)
    return path


@pytest.fixture
def unified_dataset_csv(tmp_path):
    path = tmp_path / "unified_dataset.csv"
    pd.DataFrame(
        [
            {
                "txid": 123,
                "timestamp": "2015-01-01 00:00:00",
                "geo_country": "US",
                "asn": "7922",
                "input_addresses": "['wallet_AAA']",
                "output_addresses": "['wallet_BBB']",
            },
            {
                "txid": 124,
                "timestamp": "2015-01-02 00:00:00",
                "geo_country": "US",
                "asn": "7018",
                "input_addresses": "[]",
                "output_addresses": "[]",
            },
            {
                "txid": 125,
                "timestamp": "2015-01-03 00:00:00",
                "geo_country": "CN",
                "asn": "4134",
                "input_addresses": "[]",
                "output_addresses": "[]",
            },
        ]
    ).to_csv(path, index=False)
    return path


@pytest.fixture
def app(monkeypatch, alerts_csv, unified_dataset_csv):
    """A Flask test app pointed at the synthetic fixtures above instead of the real
    default paths (data/processed/unified_dataset.csv, outputs/alerts/ranked_alerts.csv).
    """
    monkeypatch.setattr(server_module, "DEFAULT_ALERTS_PATH", alerts_csv)
    monkeypatch.setattr(server_module, "DEFAULT_TX_PATH", unified_dataset_csv)
    flask_app = server_module.create_app()
    flask_app.config.update(TESTING=True)
    return flask_app


@pytest.fixture
def client(app):
    return app.test_client()


@pytest.fixture
def app_missing_files(monkeypatch, tmp_path):
    """A Flask test app pointed at paths that don't exist, to test the 404/error path."""
    monkeypatch.setattr(server_module, "DEFAULT_ALERTS_PATH", tmp_path / "does_not_exist.csv")
    monkeypatch.setattr(server_module, "DEFAULT_TX_PATH", tmp_path / "also_missing.csv")
    flask_app = server_module.create_app()
    flask_app.config.update(TESTING=True)
    return flask_app


@pytest.fixture
def client_missing_files(app_missing_files):
    return app_missing_files.test_client()
