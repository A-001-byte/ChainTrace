"""Person A's Phase 1 data pipeline.

Loads real Elliptic (transactions) + Elliptic++ (wallets) data via graph_ml's tested
loaders, attaches a synthetic label-correlated network layer, resolves it through the
real GeoLite2 CSV exports, and exports one unified dataset for Person B's ML pipeline.
"""

from __future__ import annotations

import numpy as np
import pandas as pd

from src.graph_ml.data_loader import load_elliptic_pp_wallets, load_elliptic_transactions

from . import config, geo_lookup, network_synth

# Contract A: the 9 blockchain-layer columns this module owns. Exact names and order —
# Ujjwal's network layer (src_ip, dst_ip, src_port, dst_port, geo_country, asn) attaches
# on top of this in attach_network_layer(), never inside build_blockchain_dataset().
BLOCKCHAIN_COLUMNS = [
    "txid",
    "timestamp",
    "input_addresses",
    "output_addresses",
    "input_amounts",
    "output_amounts",
    "fee",
    "script_type",
    "label",
]


def _addresses_and_amounts_per_tx(nodes: pd.DataFrame, wallets: pd.DataFrame, addr_tx_edges: pd.DataFrame,
                                   tx_addr_edges: pd.DataFrame):
    """Build input_addresses[]/output_addresses[]/input_amounts[]/output_amounts[]/fee per txId.

    Amounts and fee are real, wallet-level estimates (Elliptic++'s btc_sent_mean /
    btc_received_mean / fees_mean), not per-edge exact values — Elliptic++ doesn't publish
    per-edge BTC amounts, only per-wallet aggregates. Documented here and in the README as
    an estimate, matching the Blueprint's "Real (partial) ... flag clearly" note for this
    column pair. A wallet can appear at multiple time_steps; keep_tx_ids-filtered rows are
    already sorted address,time_step by the loader, so keep the latest (most complete) row
    per address for the amount lookup.
    wallets, addr_tx_edges, tx_addr_edges: already filtered to the current tx set by the caller.
    """
    wallet_latest = wallets.drop_duplicates("address", keep="last").set_index("address")
    amount_cols = ["btc_sent_mean", "btc_received_mean", "fees_mean"]
    missing = [c for c in amount_cols if c not in wallet_latest.columns]
    if missing:
        raise KeyError(f"Expected wallet amount columns not found: {missing}")

    addr_tx = addr_tx_edges.merge(
        wallet_latest[["btc_sent_mean", "fees_mean"]], left_on="address", right_index=True, how="left"
    )
    tx_addr = tx_addr_edges.merge(
        wallet_latest[["btc_received_mean"]], left_on="address", right_index=True, how="left"
    )

    input_addresses = addr_tx.groupby("txId")["address"].apply(list)
    output_addresses = tx_addr.groupby("txId")["address"].apply(list)
    input_amounts = addr_tx.groupby("txId")["btc_sent_mean"].apply(list)
    output_amounts = tx_addr.groupby("txId")["btc_received_mean"].apply(list)
    fee_estimate = addr_tx.groupby("txId")["fees_mean"].mean()

    def _reindexed_list_column(series: pd.Series, tx_ids: pd.Series) -> list:
        aligned = series.reindex(tx_ids)
        return [v if isinstance(v, list) else [] for v in aligned]

    tx_ids = nodes["txId"]
    result = pd.DataFrame({"txId": tx_ids})
    result["input_addresses"] = _reindexed_list_column(input_addresses, tx_ids)
    result["output_addresses"] = _reindexed_list_column(output_addresses, tx_ids)
    result["input_amounts"] = _reindexed_list_column(input_amounts, tx_ids)
    result["output_amounts"] = _reindexed_list_column(output_amounts, tx_ids)
    result["fee"] = fee_estimate.reindex(tx_ids).tolist()
    return result


def build_blockchain_dataset(
    sample_timesteps: int | None = None, rng: np.random.Generator | None = None
) -> pd.DataFrame:
    """Contract A: build strictly the 9 blockchain-layer columns this module owns.

    No network/geo columns here — that's attach_network_layer()'s job, so Ujjwal's
    Sprint 2 network work has a clean, stable boundary to plug into.
    """
    if rng is None:
        rng = np.random.default_rng(config.RANDOM_STATE)

    print("Loading real Elliptic transactions...")
    nodes, edges = load_elliptic_transactions(sample_timesteps=sample_timesteps)
    n = len(nodes)
    print(f"Loaded {n} transaction nodes, {len(edges)} tx-tx edges")
    print("Label distribution:")
    print(nodes["class"].value_counts().to_string())

    print("\nLoading real Elliptic++ wallets (via graph_ml.data_loader, not reimplemented)...")
    wallets, addr_tx_edges, tx_addr_edges = load_elliptic_pp_wallets(keep_tx_ids=set(nodes["txId"]))
    print(f"Loaded {len(wallets)} wallets, {len(addr_tx_edges)} addr->tx edges, {len(tx_addr_edges)} tx->addr edges")

    print("\nBuilding input/output address lists + real wallet-derived amount/fee estimates...")
    addr_amount_df = _addresses_and_amounts_per_tx(nodes, wallets, addr_tx_edges, tx_addr_edges)
    n_with_inputs = addr_amount_df["input_addresses"].apply(len).gt(0).sum()
    print(f"{n_with_inputs}/{n} transactions have at least one matched input address")

    timestamps = [network_synth.generate_timestamp(ts, rng) for ts in nodes["time_step"]]
    script_types = network_synth.generate_script_types(n, rng)

    df = pd.DataFrame(
        {
            "txid": nodes["txId"],
            "timestamp": timestamps,
            "input_addresses": addr_amount_df["input_addresses"].tolist(),
            "output_addresses": addr_amount_df["output_addresses"].tolist(),
            "input_amounts": addr_amount_df["input_amounts"].tolist(),
            "output_amounts": addr_amount_df["output_amounts"].tolist(),
            "fee": addr_amount_df["fee"].tolist(),
            "script_type": script_types,
            "label": nodes["class"].map(config.LABEL_TO_NUMERIC).tolist(),
        }
    )
    return df[BLOCKCHAIN_COLUMNS]



def attach_network_layer(blockchain_df: pd.DataFrame, rng: np.random.Generator | None = None) -> pd.DataFrame:
    """Ujjwal's Sprint 2 boundary: attach src_ip/dst_ip/src_port/dst_port/geo_country/asn
    and VPN Catcher ground truth to a Contract A blockchain DataFrame.
    """
    print("\nAttaching network layer (IPs, ports, GeoLite2 country/ASN, VPN Catcher ground truth)...")
    return network_synth.attach_network_layer(blockchain_df, rng=rng)



def build_unified_dataset(sample_timesteps: int | None = None) -> pd.DataFrame:
    """Full demo pipeline: Contract A blockchain columns + Ujjwal's network layer,
    sharing one seeded rng so the whole run stays deterministic end to end.
    """
    rng = np.random.default_rng(config.RANDOM_STATE)
    blockchain_df = build_blockchain_dataset(sample_timesteps=sample_timesteps, rng=rng)
    return attach_network_layer(blockchain_df, rng=rng)


def build_wallet_dataset() -> pd.DataFrame:
    """Build wallet-level dataset with network layer and planting metadata.
    
    Reads wallets_features.csv, attaches network layer (IPs, geo), and marks planted wallets.
    This is the dataset used for wallet-level risk scoring.
    """
    from pathlib import Path
    
    rng = np.random.default_rng(config.RANDOM_STATE)
    
    # Load wallet features as base
    print("Loading wallet features...")
    wallets_features_csv = config.DATA_RAW_DIR / "elliptic_pp" / "wallets_features.csv"
    wallet_df = pd.read_csv(wallets_features_csv)
    print(f"Loaded {len(wallet_df)} wallets with features")
    
    # Load wallet classes/labels
    wallets_classes_csv = config.DATA_RAW_DIR / "elliptic_pp" / "wallets_classes.csv"
    wallet_classes = pd.read_csv(wallets_classes_csv)
    wallet_classes.columns = ["address", "class"]
    wallet_classes["class"] = wallet_classes["class"].map(config.CLASS_LABEL_MAP).fillna("unknown")
    wallet_classes["label"] = wallet_classes["class"].map(config.LABEL_TO_NUMERIC).fillna(-1)
    
    wallet_df = wallet_df.merge(wallet_classes[["address", "class", "label"]], on="address", how="left")
    wallet_df["label"] = wallet_df["label"].fillna(-1).astype(int)
    
    # Load ground truth (which wallets are planted)
    gt_path = Path(config.PROCESSED_DIR) / "geo_ground_truth.csv"
    if gt_path.exists():
        ground_truth = pd.read_csv(gt_path)
        planted_addrs = set(ground_truth["wallet_id"])
    else:
        planted_addrs = set()
    
    # Attach network layer
    print("Attaching network layer to wallets...")
    if not planted_addrs:
        # Generate IPs for all wallets
        labels = wallet_df["label"].tolist()
        risky_pool = network_synth.load_asn_ip_pool(config.RISKY_ASNS, config.GEOLITE_ASN_BLOCKS_CSV)
        residential_pool = network_synth.load_asn_ip_pool(config.RESIDENTIAL_ASNS, config.GEOLITE_ASN_BLOCKS_CSV)
        us_residential_pool = network_synth.load_asn_ip_pool([7922, 7018, 701], config.GEOLITE_ASN_BLOCKS_CSV)
        
        src_ips = network_synth.generate_ips_batch(labels, rng, risky_pool, residential_pool, us_residential_pool)
        wallet_df["src_ip"] = src_ips
    else:
        # Use override IPs from ground truth for planted wallets
        gt_ip_map = {}
        for _, row in ground_truth.iterrows():
            claimed_country = row["claimed_country"]
            # For now, just use a marker; in full implementation would resolve to actual IP
            gt_ip_map[row["wallet_id"]] = claimed_country
        
        labels = wallet_df["label"].tolist()
        risky_pool = network_synth.load_asn_ip_pool(config.RISKY_ASNS, config.GEOLITE_ASN_BLOCKS_CSV)
        residential_pool = network_synth.load_asn_ip_pool(config.RESIDENTIAL_ASNS, config.GEOLITE_ASN_BLOCKS_CSV)
        us_residential_pool = network_synth.load_asn_ip_pool([7922, 7018, 701], config.GEOLITE_ASN_BLOCKS_CSV)
        
        src_ips = []
        for addr, label in zip(wallet_df["address"], labels):
            if addr in planted_addrs:
                # For planted: use a placeholder (in production, would use actual override IP from ground truth)
                src_ips.append(gt_ip_map.get(addr, "0.0.0.0"))
            else:
                src_ips.append(network_synth.generate_ip(label, rng, risky_pool, residential_pool, us_residential_pool))
        
        wallet_df["src_ip"] = src_ips
    
    # Generate other network attributes
    n = len(wallet_df)
    dst_ips = [network_synth.random_public_ipv4(rng) for _ in range(n)]
    ports = network_synth.generate_ports(n, rng)
    
    wallet_df["dst_ip"] = dst_ips
    wallet_df["src_port"] = [8333] * n  # Bitcoin default
    wallet_df["dst_port"] = ports
    
    # Resolve geo from IPs
    print("Resolving geo-location from IPs...")
    geo_index = geo_lookup.build_geo_index()
    geo_countries, asns = geo_lookup.resolve_geo_batch(wallet_df["src_ip"].tolist(), geo_index)
    
    wallet_df["geo_country"] = geo_countries
    wallet_df["asn"] = asns
    
    # Mark planted wallets
    wallet_df["planted"] = wallet_df["address"].isin(planted_addrs)
    
    return wallet_df


def main(sample_timesteps: int | None = None):
    df = build_unified_dataset(sample_timesteps=sample_timesteps)

    config.PROCESSED_DIR.mkdir(parents=True, exist_ok=True)
    df.to_csv(config.UNIFIED_DATASET_CSV, index=False)

    print(f"\nExported unified dataset -> {config.UNIFIED_DATASET_CSV}")
    print(f"Final shape: {df.shape[0]} rows x {df.shape[1]} columns")
    print(f"Columns: {list(df.columns)}")
    
    # Also build wallet-level dataset
    print("\n" + "="*80)
    print("Building wallet-level dataset...")
    print("="*80)
    wallet_df = build_wallet_dataset()
    wallet_df.to_csv(config.WALLET_DATASET_CSV, index=False)
    print(f"\nExported wallet dataset -> {config.WALLET_DATASET_CSV}")
    print(f"Final shape: {wallet_df.shape[0]} rows x {wallet_df.shape[1]} columns")
    print(f"Columns: {list(wallet_df.columns)}")
    
    return df


if __name__ == "__main__":
    main()
