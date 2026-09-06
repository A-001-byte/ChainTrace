"""Contract A regression tests for src/data_pipeline.

These validate the real, already-generated data/processed/unified_dataset.csv and the
build_blockchain_dataset() contract directly against real Elliptic/Elliptic++ data — not
synthetic fixtures — so they're skipped (not falsely passed) on a machine where the raw
datasets or the generated CSV aren't present yet. The size guard mirrors
graph_ml.data_loader.elliptic_pp_available()'s own >10KB check, so an unpulled Git-LFS
pointer stub can't slip through as if it were real data.
"""

from __future__ import annotations

import ast

import pandas as pd
import pytest

from src.data_pipeline import config
from src.data_pipeline.pipeline import BLOCKCHAIN_COLUMNS, build_blockchain_dataset
from src.graph_ml import config as ml_config
from src.graph_ml.data_loader import elliptic_pp_available

EXPECTED_ROW_COUNT = 203_769

UNIFIED_CSV_MISSING = not config.UNIFIED_DATASET_CSV.exists()
RAW_ELLIPTIC_MISSING = not ml_config.ELLIPTIC_FEATURES_CSV.exists()
RAW_ELLIPTIC_PP_MISSING = not elliptic_pp_available()

requires_unified_csv = pytest.mark.skipif(
    UNIFIED_CSV_MISSING,
    reason=f"data/processed/unified_dataset.csv not found at {config.UNIFIED_DATASET_CSV}; "
    "run `python scripts/data_pipeline.py` first.",
)
requires_raw_data = pytest.mark.skipif(
    RAW_ELLIPTIC_MISSING or RAW_ELLIPTIC_PP_MISSING,
    reason="Real Elliptic/Elliptic++ raw CSVs not present under data/raw/ (or still Git-LFS "
    "pointer stubs) — this test builds the dataset directly rather than reading the CSV.",
)


@pytest.fixture(scope="module")
def unified_df() -> pd.DataFrame:
    return pd.read_csv(config.UNIFIED_DATASET_CSV)


@requires_unified_csv
def test_unified_dataset_exists_with_expected_row_count(unified_df: pd.DataFrame):
    assert len(unified_df) == EXPECTED_ROW_COUNT


@requires_unified_csv
def test_contract_a_columns_present_and_correctly_named(unified_df: pd.DataFrame):
    missing = [col for col in BLOCKCHAIN_COLUMNS if col not in unified_df.columns]
    assert not missing, f"Contract A columns missing or misspelled: {missing}"


@requires_unified_csv
def test_txid_unique_and_not_null(unified_df: pd.DataFrame):
    assert unified_df["txid"].notna().all(), "txid has null values"
    assert unified_df["txid"].is_unique, "txid has duplicate values"


@requires_unified_csv
def test_amounts_and_fees_are_not_fabricated(unified_df: pd.DataFrame):
    fee = unified_df["fee"]

    # A hardcoded/mocked fee would collapse to one or a handful of values; real per-wallet
    # fees_mean estimates vary across tens of thousands of distinct wallets.
    assert fee.dropna().nunique() > 1_000, (
        f"fee has only {fee.dropna().nunique()} unique values — looks like a fabricated "
        "constant rather than real per-wallet estimates."
    )
    assert (fee.dropna() >= 0).all(), "fee has negative values, which is not a valid BTC amount."

    # Elliptic++ doesn't cover every transaction; real coverage gaps should show up as nulls,
    # not be silently backfilled with a placeholder that would hide the gap.
    n_null = fee.isna().sum()
    assert 0 < n_null < len(fee), (
        f"fee has {n_null}/{len(fee)} nulls — expected some real coverage gaps, but not all "
        "rows null and not zero nulls (which would suggest gaps were papered over)."
    )

    def _parse_list(cell) -> list:
        if isinstance(cell, str):
            return ast.literal_eval(cell)
        return cell if isinstance(cell, list) else []

    sample = unified_df[["input_amounts", "output_amounts"]].dropna().head(200)
    parsed_inputs = sample["input_amounts"].apply(_parse_list)
    non_empty = parsed_inputs[parsed_inputs.apply(len) > 0]
    assert len(non_empty) > 0, "No non-empty input_amounts found in a 200-row sample."
    assert all(isinstance(v, (int, float)) for lst in non_empty for v in lst), (
        "input_amounts contains non-numeric entries."
    )

    # A fabricated/mock dataset would likely repeat the same list for every row.
    distinct_lists = non_empty.apply(tuple).nunique()
    assert distinct_lists > 1, "Every input_amounts list in the sample is identical — looks fabricated."


@requires_raw_data
def test_build_blockchain_dataset_contract():
    """Direct unit test of the Contract A function itself, not just the exported CSV."""
    df = build_blockchain_dataset(sample_timesteps=2)

    assert list(df.columns) == BLOCKCHAIN_COLUMNS, (
        f"build_blockchain_dataset() columns {list(df.columns)} != contract {BLOCKCHAIN_COLUMNS}"
    )
    assert df["txid"].notna().all()
    assert df["txid"].is_unique
    assert set(df["label"].unique()).issubset({-1, 0, 1}), (
        f"label contains values outside {{-1, 0, 1}}: {sorted(df['label'].unique())}"
    )
