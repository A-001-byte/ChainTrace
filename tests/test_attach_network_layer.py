"""Standalone test for attach_network_layer & plant_geo_temporal_evasion."""

from pathlib import Path
import numpy as np
import pandas as pd
import pytest

from src.data_pipeline import config, network_synth


def test_attach_network_layer_and_geo_temporal_evasion(tmp_path):
    rng = np.random.default_rng(config.RANDOM_STATE)
    ground_truth_csv = tmp_path / "geo_ground_truth.csv"

    # Create 100 sample transactions with 10 repeating input wallets
    # Timestamps clustered in 14:00-18:00 UTC (US working hours 09:00-13:00 EST)
    base_dates = pd.date_range("2026-08-01", periods=20, freq="D")
    timestamps = []
    for d in base_dates:
        for h in [14, 15, 16, 17, 18]:
            timestamps.append(d + pd.Timedelta(hours=h))

    n = len(timestamps)  # 100 transactions
    df_sample = pd.DataFrame(
        {
            "txid": [f"tx_{i:04d}" for i in range(n)],
            "timestamp": timestamps,
            "input_addresses": [[f"wallet_{i%10}"] for i in range(n)],
            "output_addresses": [[f"out_{i%10}"] for i in range(n)],
            "input_amounts": [[1.0] for _ in range(n)],
            "output_amounts": [[0.99] for _ in range(n)],
            "fee": [0.01] * n,
            "script_type": ["P2PKH"] * n,
            "label": [1 if i % 4 == 0 else 0 for i in range(n)],
        }
    )


    out_df = network_synth.attach_network_layer(
        df_sample.copy(),
        rng=rng,
        plant_evasion=True,
        evasion_ratio=0.20,
        ground_truth_path=ground_truth_csv,
    )

    # 1. Verify row count preserved and columns added
    assert len(out_df) == n
    expected_cols = ["src_ip", "dst_ip", "src_port", "dst_port", "geo_country", "asn"]
    for col in expected_cols:
        assert col in out_df.columns
        assert out_df[col].isnull().sum() == 0

    # 2. Verify ground truth contains the full VPN Catcher schema.
    assert ground_truth_csv.exists()
    gt_df = pd.read_csv(ground_truth_csv)
    assert list(gt_df.columns) == [
        "wallet_id",
        "planted",
        "claimed_country",
        "peak_utc_hour",
    ]

    # Planting is proportional to wallets appearing in illicit-labelled rows,
    # rather than all active wallets.
    illicit_wallets = {
        address
        for _, row in df_sample[df_sample["label"] == 1].iterrows()
        for address in row["input_addresses"]
    }
    expected_planted = max(1, int(len(illicit_wallets) * 0.20))
    planted_wallets = set(gt_df["wallet_id"])
    assert len(planted_wallets) == expected_planted
    assert planted_wallets <= illicit_wallets
    assert gt_df["planted"].eq(True).all()

    # 3. Verify PERSISTENCE of claimed geo_country for each planted wallet
    for planted_w in planted_wallets:
        wallet_rows = out_df[out_df["input_addresses"].apply(lambda addrs: planted_w in addrs)]
        assert len(wallet_rows) > 0
        claimed_countries = set(wallet_rows["geo_country"])
        assert len(claimed_countries) == 1, f"Planted wallet {planted_w} had inconsistent countries: {claimed_countries}"

        # 4. Verify TRUE GEO-TEMPORAL MISMATCH (sleeping hours in local time)
        claimed_c = list(claimed_countries)[0]
        if claimed_c in config.COUNTRY_UTC_OFFSET:
            offset = config.COUNTRY_UTC_OFFSET[claimed_c]
            # Transaction timestamps peak at 14:00-18:00 UTC
            # Local time in claimed_c: (UTC + offset) % 24
            # e.g., if claimed_c is JP (UTC+9) or CN (UTC+8), 14:00 UTC = 22:00 / 23:00 local time
            for ts in wallet_rows["timestamp"]:
                local_hour = (ts.hour + offset) % 24
                # Check that local hour falls in sleeping hours (>= 22 or <= 6)
                assert (local_hour >= 22 or local_hour <= 6), f"Planted wallet {planted_w} in {claimed_c} fell in working hours: {local_hour}"
