"""Unit tests for ChainTrace dashboard components."""

import io
import json
import pandas as pd
import pytest

from src.dashboard.config import get_custom_css
from src.dashboard.data_loader import (
    get_active_datasets,
    load_file,
    sanitize_alerts_df,
    sanitize_transaction_df,
)
from src.dashboard.mock_data import generate_mock_alerts, generate_mock_transactions


def test_mock_transactions_generation():
    df = generate_mock_transactions(count=50)
    assert isinstance(df, pd.DataFrame)
    assert len(df) == 50
    req_cols = ["txid", "timestamp", "src_ip", "dst_ip", "geo_country", "asn"]
    for col in req_cols:
        assert col in df.columns


def test_mock_alerts_generation():
    tx_df = generate_mock_transactions(count=20)
    alerts_df = generate_mock_alerts(tx_df=tx_df, count=15)
    assert isinstance(alerts_df, pd.DataFrame)
    assert len(alerts_df) == 15
    req_cols = ["node_id", "risk_score", "classifier_confidence", "anomaly_score", "cluster_id", "reason"]
    for col in req_cols:
        assert col in alerts_df.columns
    # Check descending order of risk scores
    scores = alerts_df["risk_score"].tolist()
    assert scores == sorted(scores, reverse=True)


def test_custom_css_injection():
    css = get_custom_css()
    assert "<style>" in css
    assert "ct-header-banner" in css


def test_data_loader_fallback():
    tx_df, alerts_df, label, warnings = get_active_datasets(None, None)
    assert len(tx_df) > 0
    assert len(alerts_df) > 0
    assert "Mock Data" in label
    assert warnings == []


def test_data_loader_csv_parsing():
    mock_csv_data = (
        "txid,timestamp,src_ip,dst_ip,geo_country,asn\n"
        "tx_1,2026-08-30T10:00:00Z,1.1.1.1,2.2.2.2,United States,AS13335\n"
        "tx_2,2026-08-30T11:00:00Z,3.3.3.3,4.4.4.4,Romania,AS60068\n"
    )
    buf = io.StringIO(mock_csv_data)
    setattr(buf, "name", "test.csv")
    ok, msg, df = load_file(buf)
    assert ok is True
    assert len(df) == 2

    valid, clean_msg, clean_df = sanitize_transaction_df(df)
    assert valid is True
    assert "src_ip" in clean_df.columns


def test_data_loader_json_parsing():
    json_data = [
        {"node_id": "bc1qtest1", "risk_score": 0.95, "cluster_id": "Cluster #01", "reason": "Test explanation 1"},
        {"node_id": "bc1qtest2", "risk_score": 0.72, "cluster_id": "Cluster #02", "reason": "Test explanation 2"},
    ]
    buf = io.StringIO(json.dumps(json_data))
    setattr(buf, "name", "test.json")
    ok, msg, df = load_file(buf)
    assert ok is True
    assert len(df) == 2

    valid, clean_msg, clean_df = sanitize_alerts_df(df)
    assert valid is True
    assert clean_df.iloc[0]["node_id"] == "bc1qtest1"
