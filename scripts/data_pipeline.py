"""
ChainTrace data pipeline.

Loads the Elliptic Bitcoin transaction dataset, attaches a synthetic
network layer (source IP / port / timestamp), enriches it with GeoLite2
country + ASN lookups, and exports one merged CSV.
"""

import ipaddress
from datetime import datetime, timedelta
from pathlib import Path

import geoip2.database
import geoip2.errors
import numpy as np
import pandas as pd

BASE_DIR = Path(__file__).resolve().parent.parent
DATA_DIR = BASE_DIR / "data"
OUTPUT_DIR = BASE_DIR / "output"

FEATURES_PATH = DATA_DIR / "elliptic_txs_features.csv"
CLASSES_PATH = DATA_DIR / "elliptic_txs_classes.csv"
EDGELIST_PATH = DATA_DIR / "elliptic_txs_edgelist.csv"
CITY_MMDB_PATH = DATA_DIR / "GeoLite2-City.mmdb"
ASN_MMDB_PATH = DATA_DIR / "GeoLite2-ASN.mmdb"
OUTPUT_PATH = OUTPUT_DIR / "merged_data.csv"

RANDOM_SEED = 42
N_FEATURES = 165
# Elliptic time steps are ~2-week windows; anchor is arbitrary since the
# paper does not publish real calendar dates.
ANCHOR_DATE = datetime(2015, 1, 1)
TIME_STEP_DAYS = 14
COMMON_PORTS = np.array([80, 443, 8333, 8332, 22, 21, 3389, 53, 25, 110])


def load_transactions() -> pd.DataFrame:
    feature_cols = ["txId", "time_step"] + [f"feat_{i}" for i in range(1, N_FEATURES + 1)]
    features = pd.read_csv(FEATURES_PATH, header=None, names=feature_cols)
    classes = pd.read_csv(CLASSES_PATH)
    edges = pd.read_csv(EDGELIST_PATH)

    out_degree = edges.groupby("txId1").size().rename("out_degree")
    in_degree = edges.groupby("txId2").size().rename("in_degree")

    df = features.merge(classes, on="txId", how="left")
    df = df.merge(out_degree, left_on="txId", right_index=True, how="left")
    df = df.merge(in_degree, left_on="txId", right_index=True, how="left")
    df["out_degree"] = df["out_degree"].fillna(0).astype(int)
    df["in_degree"] = df["in_degree"].fillna(0).astype(int)
    return df


def random_public_ipv4(rng: np.random.Generator) -> str:
    while True:
        ip = ipaddress.IPv4Address(int(rng.integers(1, 2**32 - 1)))
        if ip.is_global and not ip.is_multicast and not ip.is_reserved:
            return str(ip)


def generate_network_layer(n: int, rng: np.random.Generator):
    ips = [random_public_ipv4(rng) for _ in range(n)]
    common_ports = rng.choice(COMMON_PORTS, size=n)
    random_ports = rng.integers(1024, 65535, size=n)
    use_common = rng.random(n) < 0.7
    ports = np.where(use_common, common_ports, random_ports)
    return ips, ports.tolist()


def generate_timestamps(time_steps, rng: np.random.Generator):
    timestamps = []
    for step in time_steps:
        window_start = ANCHOR_DATE + timedelta(days=(int(step) - 1) * TIME_STEP_DAYS)
        jitter = timedelta(seconds=int(rng.integers(0, TIME_STEP_DAYS * 24 * 3600)))
        timestamps.append(window_start + jitter)
    return timestamps


def resolve_geo(ips):
    countries, country_codes, cities = [], [], []
    asns, asn_orgs = [], []

    with geoip2.database.Reader(str(CITY_MMDB_PATH)) as city_reader, \
         geoip2.database.Reader(str(ASN_MMDB_PATH)) as asn_reader:
        for ip in ips:
            try:
                city_resp = city_reader.city(ip)
                countries.append(city_resp.country.name or "Unknown")
                country_codes.append(city_resp.country.iso_code or "XX")
                cities.append(city_resp.city.name or "Unknown")
            except geoip2.errors.AddressNotFoundError:
                countries.append("Unknown")
                country_codes.append("XX")
                cities.append("Unknown")

            try:
                asn_resp = asn_reader.asn(ip)
                asns.append(asn_resp.autonomous_system_number)
                asn_orgs.append(asn_resp.autonomous_system_organization)
            except geoip2.errors.AddressNotFoundError:
                asns.append(np.nan)
                asn_orgs.append("Unknown")

    return countries, country_codes, cities, asns, asn_orgs


def main():
    rng = np.random.default_rng(RANDOM_SEED)

    print("Loading Elliptic transaction data...")
    df = load_transactions()
    n = len(df)
    print(f"Loaded {n} transactions ({df.shape[1]} columns)")

    print("Generating synthetic network layer (IP / port / timestamp)...")
    ips, ports = generate_network_layer(n, rng)
    timestamps = generate_timestamps(df["time_step"].tolist(), rng)
    df["src_ip"] = ips
    df["src_port"] = ports
    df["tx_timestamp"] = timestamps

    print("Resolving IPs against GeoLite2 (City + ASN)...")
    countries, country_codes, cities, asns, asn_orgs = resolve_geo(ips)
    df["country"] = countries
    df["country_code"] = country_codes
    df["city"] = cities
    df["asn"] = asns
    df["asn_org"] = asn_orgs

    OUTPUT_DIR.mkdir(exist_ok=True)
    df.to_csv(OUTPUT_PATH, index=False)
    print(f"Exported merged dataset -> {OUTPUT_PATH}")
    print(f"Final shape: {df.shape[0]} rows x {df.shape[1]} columns")


if __name__ == "__main__":
    main()
