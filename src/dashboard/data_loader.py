"""ChainTrace Data Loader.

Provides resilient file ingestion for CSV and JSON files, schema validation,
parsing of complex columns, and fallback mechanisms for live demo stability.
"""

from __future__ import annotations

import io
import json
import logging
from typing import Any

import pandas as pd

from .mock_data import generate_mock_alerts, generate_mock_transactions

logger = logging.getLogger(__name__)

# Expected minimum schema columns for validation
REQUIRED_TX_COLS = ["txid", "timestamp"]
OPTIONAL_TX_COLS = [
    "src_ip",
    "dst_ip",
    "src_port",
    "dst_port",
    "input_addresses",
    "output_addresses",
    "input_amounts",
    "output_amounts",
    "fee",
    "script_type",
    "geo_country",
    "asn",
]

REQUIRED_ALERT_COLS = ["node_id", "risk_score"]
OPTIONAL_ALERT_COLS = [
    "node_type",
    "classifier_confidence",
    "anomaly_score",
    "cluster_id",
    "reason",
    "label",
    "geo_country",
    "asn",
]


def load_file(file_obj_or_path: Any) -> tuple[bool, str, pd.DataFrame]:
    """Read a CSV or JSON file from a file path, string, or Streamlit UploadedFile object.

    Returns:
        (success: bool, message: str, dataframe: pd.DataFrame)
    """
    if file_obj_or_path is None:
        return False, "No file provided.", pd.DataFrame()

    try:
        filename = getattr(file_obj_or_path, "name", str(file_obj_or_path)).lower()

        if filename.endswith(".json"):
            if hasattr(file_obj_or_path, "read"):
                content = file_obj_or_path.read()
                if isinstance(content, bytes):
                    content = content.decode("utf-8")
                # Reset stream pointer if needed
                if hasattr(file_obj_or_path, "seek"):
                    file_obj_or_path.seek(0)
                data = json.loads(content)
            else:
                with open(file_obj_or_path, "r", encoding="utf-8") as f:
                    data = json.load(f)

            if isinstance(data, list):
                df = pd.DataFrame(data)
            elif isinstance(data, dict):
                # Check if wrapped under a key e.g. {"data": [...]} or {"alerts": [...]}
                for key in ["data", "alerts", "transactions", "nodes", "rows"]:
                    if key in data and isinstance(data[key], list):
                        df = pd.DataFrame(data[key])
                        break
                else:
                    df = pd.DataFrame([data])
            else:
                return False, "JSON content must be an array of records or dictionary object.", pd.DataFrame()

        elif filename.endswith(".csv") or hasattr(file_obj_or_path, "read"):
            if hasattr(file_obj_or_path, "read"):
                df = pd.read_csv(file_obj_or_path)
                if hasattr(file_obj_or_path, "seek"):
                    file_obj_or_path.seek(0)
            else:
                df = pd.read_csv(file_obj_or_path)
        else:
            return False, f"Unsupported file extension for '{filename}'. Supported formats: CSV, JSON", pd.DataFrame()

        if df.empty:
            return False, "Uploaded file contains 0 rows.", pd.DataFrame()

        return True, f"Successfully loaded {len(df)} records.", df

    except Exception as e:
        logger.error("Failed to load file: %s", str(e))
        return False, f"Error parsing file: {str(e)}", pd.DataFrame()


def parse_json_column(val: Any) -> list[Any] | str:
    """Parse stringified JSON lists (e.g. from CSVs) or leave intact."""
    if isinstance(val, list):
        return val
    if isinstance(val, str):
        val = val.strip()
        if val.startswith("[") and val.endswith("]"):
            try:
                return json.loads(val)
            except Exception:
                pass
    return [val] if val else []


def sanitize_transaction_df(df: pd.DataFrame) -> tuple[bool, str, pd.DataFrame]:
    """Validate and clean transaction dataset DataFrame."""
    missing_req = [col for col in REQUIRED_TX_COLS if col not in df.columns]
    if missing_req:
        return False, f"Missing required transaction columns: {', '.join(missing_req)}", df

    clean_df = df.copy()

    # Fill optional missing columns with defaults
    if "src_ip" not in clean_df.columns:
        clean_df["src_ip"] = "0.0.0.0"
    if "dst_ip" not in clean_df.columns:
        clean_df["dst_ip"] = "0.0.0.0"
    if "geo_country" not in clean_df.columns:
        clean_df["geo_country"] = "Unknown"
    if "asn" not in clean_df.columns:
        clean_df["asn"] = "Unknown ASN"
    if "fee" not in clean_df.columns:
        clean_df["fee"] = 0.0005
    if "script_type" not in clean_df.columns:
        clean_df["script_type"] = "P2PKH"

    # Parse address lists if stringified
    for col in ["input_addresses", "output_addresses"]:
        if col in clean_df.columns:
            clean_df[col] = clean_df[col].apply(parse_json_column)
        else:
            clean_df[col] = [[] for _ in range(len(clean_df))]

    for col in ["input_amounts", "output_amounts"]:
        if col in clean_df.columns:
            clean_df[col] = clean_df[col].apply(parse_json_column)
        else:
            clean_df[col] = [[] for _ in range(len(clean_df))]

    return True, f"Valid transaction dataset ({len(clean_df)} records).", clean_df


def sanitize_alerts_df(df: pd.DataFrame) -> tuple[bool, str, pd.DataFrame]:
    """Validate and clean ML pipeline alerts DataFrame."""
    missing_req = [col for col in REQUIRED_ALERT_COLS if col not in df.columns]
    if missing_req:
        return False, f"Missing required alert columns: {', '.join(missing_req)}", df

    clean_df = df.copy()

    # Ensure risk_score is numeric
    clean_df["risk_score"] = pd.to_numeric(clean_df["risk_score"], errors="coerce").fillna(0.0)

    # Defaults for optional fields
    if "node_type" not in clean_df.columns:
        clean_df["node_type"] = "wallet"
    if "cluster_id" not in clean_df.columns:
        clean_df["cluster_id"] = "Cluster #00"
    if "reason" not in clean_df.columns:
        clean_df["reason"] = "Flagged by ML risk scoring ensemble"
    if "classifier_confidence" not in clean_df.columns:
        clean_df["classifier_confidence"] = clean_df["risk_score"]
    if "anomaly_score" not in clean_df.columns:
        clean_df["anomaly_score"] = clean_df["risk_score"]
    if "label" not in clean_df.columns:
        clean_df["label"] = "unknown"
    if "geo_country" not in clean_df.columns:
        clean_df["geo_country"] = "Unknown"
    if "asn" not in clean_df.columns:
        clean_df["asn"] = "Unknown ASN"

    # Sort descending by risk score
    clean_df = clean_df.sort_values("risk_score", ascending=False).reset_index(drop=True)
    return True, f"Valid alert dataset ({len(clean_df)} records).", clean_df


def get_active_datasets(
    tx_file_input: Any = None, alerts_file_input: Any = None
) -> tuple[pd.DataFrame, pd.DataFrame, str, list[str]]:
    """Master dataset retrieval with fallback mechanism.

    Returns:
        (tx_df, alerts_df, source_label, warnings_list)
    """
    warnings: list[str] = []
    use_mock_tx = True
    use_mock_alerts = True

    tx_df = pd.DataFrame()
    alerts_df = pd.DataFrame()

    # 1. Try Loading Transactions
    if tx_file_input is not None:
        ok, msg, raw_tx_df = load_file(tx_file_input)
        if ok:
            valid, clean_msg, clean_tx_df = sanitize_transaction_df(raw_tx_df)
            if valid:
                tx_df = clean_tx_df
                use_mock_tx = False
            else:
                warnings.append(f"Transaction file warning: {clean_msg} (Using fallback mock transactions)")
        else:
            warnings.append(f"Transaction load error: {msg} (Using fallback mock transactions)")

    # 2. Try Loading Alerts
    if alerts_file_input is not None:
        ok, msg, raw_alert_df = load_file(alerts_file_input)
        if ok:
            valid, clean_msg, clean_alert_df = sanitize_alerts_df(raw_alert_df)
            if valid:
                alerts_df = clean_alert_df
                use_mock_alerts = False
            else:
                warnings.append(f"Alert file warning: {clean_msg} (Using fallback mock alerts)")
        else:
            warnings.append(f"Alert load error: {msg} (Using fallback mock alerts)")

    # Fallbacks if files not provided or invalid
    if use_mock_tx:
        tx_df = generate_mock_transactions()

    if use_mock_alerts:
        alerts_df = generate_mock_alerts(tx_df=tx_df)

    if not use_mock_tx and not use_mock_alerts:
        source_label = "Live Uploaded Data"
    elif not use_mock_tx or not use_mock_alerts:
        source_label = "Partial Uploaded + Mock Fallback Data"
    else:
        source_label = "Synthetic Mock Data (Offline Prototype Mode)"

    return tx_df, alerts_df, source_label, warnings
