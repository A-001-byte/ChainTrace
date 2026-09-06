"""Synthetic network layer: label-correlated IPs, ports, and timestamps.

Illicit-labeled transactions are weighted toward real CIDR blocks announced by
hosting/VPN/Tor-friendly ASNs; licit-labeled transactions are weighted toward real CIDR
blocks announced by large residential ISPs. Both pools are read from the team's real
GeoLite2-ASN-Blocks-IPv4.csv at load time -- the ASN *list* is a documented placeholder
(see config.py), but every IP generated sits inside a real, currently-announced block for
that ASN, not a hand-guessed range.
"""

from __future__ import annotations

import ipaddress
from datetime import timedelta
from pathlib import Path

import numpy as np
import pandas as pd

from . import config, geo_lookup


def load_asn_ip_pool(asns: list[int], asn_blocks_csv: str | Path) -> list[str]:
    """Return every CIDR block announced by the given ASNs, as strings."""
    path = Path(asn_blocks_csv)
    if not path.exists():
        raise FileNotFoundError(f"ASN blocks CSV not found at {path}")
    if not asns:
        raise ValueError("ASNs list cannot be empty")

    df = pd.read_csv(path, usecols=["network", "autonomous_system_number"])
    df = df.dropna(subset=["network", "autonomous_system_number"])
    df["autonomous_system_number"] = df["autonomous_system_number"].astype(int)

    matched = df[df["autonomous_system_number"].isin(asns)]
    if matched.empty:
        raise ValueError(f"No CIDR blocks found for ASNs {asns} in {path}")
    return matched["network"].tolist()


def _random_ip_in_cidr(cidr: str, rng: np.random.Generator) -> str:
    net = ipaddress.IPv4Network(cidr, strict=False)
    offset = int(rng.integers(0, net.num_addresses))
    return str(net.network_address + offset)


def random_ip_from_pool(pool: list[str], rng: np.random.Generator) -> str:
    if not pool:
        raise ValueError("IP pool cannot be empty")
    cidr = pool[int(rng.integers(0, len(pool)))]
    return _random_ip_in_cidr(cidr, rng)


def random_public_ipv4(rng: np.random.Generator, max_attempts: int = 1000) -> str:
    for _ in range(max_attempts):
        ip = ipaddress.IPv4Address(int(rng.integers(1, 2**32 - 1)))
        if ip.is_global and not ip.is_multicast and not ip.is_reserved:
            return str(ip)
    return "8.8.8.8"


def _normalize_label(label: str | int | float | None) -> str:
    if label is None:
        return "unknown"
    lbl = str(label).strip().lower()
    if lbl in ("1", "illicit"):
        return "illicit"
    if lbl in ("0", "licit"):
        return "licit"
    return "unknown"


def generate_ip(
    label: str | int,
    rng: np.random.Generator,
    risky_pool: list[str],
    residential_pool: list[str],
    us_residential_pool: list[str] | None = None,
) -> str:
    """label is normalized string or numeric class: 'illicit'/1 | 'licit'/0 | 'unknown'/-1.

    illicit: 60% risky-ASN IP, 40% uniform random public.
    licit:   81.9567% US-residential-ASN IP (Comcast/AT&T/Verizon CIDRs), 18.0433% random public.
             P calibrated so geo_country resolves to US in ~82% of licit cases.
             Formula: P(US pool) = (0.82 - 0.0024) / 0.9976 = 0.819567
    unknown: uniform random public
    """
    norm_label = _normalize_label(label)
    if norm_label == "illicit":
        if risky_pool and rng.random() < 0.6:
            return random_ip_from_pool(risky_pool, rng)
        return random_public_ipv4(rng)
    if norm_label == "licit":
        # Draw directly from US-residential pool at P=0.819567 (bypasses global residential).
        # Expected US geo_country = 0.819567*1.0 + 0.180433*0.0024 ~= 82%.
        pool = us_residential_pool if us_residential_pool else residential_pool
        if pool and rng.random() < 0.819567:
            return random_ip_from_pool(pool, rng)
        return random_public_ipv4(rng)
    return random_public_ipv4(rng)


def generate_ips_batch(
    labels: list[str | int],
    rng: np.random.Generator,
    risky_pool: list[str],
    residential_pool: list[str],
    us_residential_pool: list[str] | None = None,
) -> list[str]:
    """Generate IPs in bulk for a list of transaction labels.

    For licit transactions, draws directly from us_residential_pool at P=0.819567
    (Comcast 7922, AT&T 7018, Verizon 701) -- bypassing the global residential pool.
    Expected licit geo_country=US: 0.819567*1.0 + 0.180433*0.0024 ~= 82%.
    """
    return [generate_ip(lbl, rng, risky_pool, residential_pool, us_residential_pool) for lbl in labels]


def generate_ports(n: int, rng: np.random.Generator) -> list[int]:
    if n <= 0:
        return []
    use_main = rng.random(n) < config.PORT_MAIN_PROB
    alternatives = rng.choice(config.PORT_ALTERNATIVES, size=n)
    ports = np.where(use_main, config.PORT_MAIN, alternatives)
    return ports.tolist()


def generate_timestamp(time_step: int | float, rng: np.random.Generator):
    step = int(time_step) if time_step is not None and time_step >= 1 else 1
    window_start = config.ANCHOR_DATE + timedelta(days=(step - 1) * config.TIME_STEP_DAYS)
    jitter = timedelta(seconds=int(rng.integers(0, config.TIME_STEP_DAYS * 24 * 3600)))
    return window_start + jitter


def generate_script_types(n: int, rng: np.random.Generator) -> list[str]:
    if n <= 0:
        return []
    return rng.choice(config.SCRIPT_TYPES, size=n, p=config.SCRIPT_TYPE_WEIGHTS).tolist()


def _extract_addresses(val) -> list[str]:
    if isinstance(val, list):
        return [str(a) for a in val]
    if isinstance(val, str) and val.strip():
        s = val.strip()
        if s.startswith("[") and s.endswith("]"):
            try:
                import json
                parsed = json.loads(s)
                if isinstance(parsed, list):
                    return [str(a) for a in parsed]
            except Exception:
                try:
                    import ast
                    parsed = ast.literal_eval(s)
                    if isinstance(parsed, list):
                        return [str(a) for a in parsed]
                except Exception:
                    pass
        return [s]
    return []


def plant_geo_temporal_evasion(
    df: pd.DataFrame,
    rng: np.random.Generator,
    geo_index: geo_lookup.GeoIndex,
    evasion_ratio: float = 0.05,
    ground_truth_path: Path | str | None = None,
) -> pd.DataFrame:
    """Plant geo-temporal evasion wallets (VPN Catcher ground truth) and export planted wallet IDs.

    - Groups transactions by input wallet address.
    - Calculates peak UTC activity hour for each wallet from df["timestamp"].
    - Selects evasion_ratio subset of active wallets for planted evasion.
    - Assigns a persistent claimed geo_country and asn for each planted wallet such that
      its peak activity hour falls in deep night / sleeping hours (00:00-06:00 local time)
      in the claimed country (a believable working-hours-shaped timezone mismatch).
    - Overrides src_ip, geo_country, and asn consistently across all transactions of planted wallets.
    - Writes planted-wallet metadata to data/processed/geo_ground_truth.csv.
    """
    if "input_addresses" not in df.columns or "timestamp" not in df.columns:
        return df

    wallet_hours: dict[str, list[int]] = {}
    for idx, row in df.iterrows():
        ts = row["timestamp"]
        if pd.isna(ts):
            continue
        try:
            if isinstance(ts, str):
                ts = pd.to_datetime(ts)
            hour = int(ts.hour)
        except Exception:
            continue

        addrs = _extract_addresses(row["input_addresses"])
        for addr in addrs:
            wallet_hours.setdefault(addr, []).append(hour)

    active_wallets = sorted(list(wallet_hours.keys()))
    if not active_wallets:
        return df

    # CRITICAL: plant only into illicit-labelled wallets.
    # Licit wallets with a mismatched country are semantically wrong for VPN Catcher
    # (an honest US wallet being assigned CN geo is not evasion -- it's noise) and
    # they were depressing licit-US% by ~19 points because ~19% of licit rows share
    # a transaction with a planted wallet and inherit its override country.
    #
    # Build a set of wallet IDs that appear exclusively in illicit-labelled rows.
    illicit_label_rows = df[df["label"].apply(_normalize_label) == "illicit"]
    illicit_wallet_ids: set[str] = set()
    for _, row in illicit_label_rows.iterrows():
        for addr in _extract_addresses(row.get("input_addresses", [])):
            if addr in wallet_hours:  # only wallets we have timestamp data for
                illicit_wallet_ids.add(addr)

    candidate_wallets = sorted(illicit_wallet_ids) if illicit_wallet_ids else active_wallets
    n_plant = max(1, int(len(candidate_wallets) * evasion_ratio))
    planted_wallets = set(rng.choice(candidate_wallets, size=min(n_plant, len(candidate_wallets)), replace=False))

    unique_geo_countries = [c for c in np.unique(geo_index.city_country) if c in config.COUNTRY_UTC_OFFSET]
    if not unique_geo_countries:
        unique_geo_countries = list(config.COUNTRY_UTC_OFFSET.keys())

    wallet_overrides: dict[str, tuple[str, int]] = {}
    for wallet in planted_wallets:
        hours = wallet_hours[wallet]
        peak_utc_hour = int(round(float(np.mean(hours)))) % 24

        mismatched_countries = []
        for c in unique_geo_countries:
            offset = config.COUNTRY_UTC_OFFSET.get(c, 0)
            local_hour = (peak_utc_hour + offset) % 24
            if local_hour >= 22 or local_hour <= 6:
                mismatched_countries.append(c)

        if not mismatched_countries:
            mismatched_countries = [c for c in unique_geo_countries if abs(config.COUNTRY_UTC_OFFSET.get(c, 0) - config.COUNTRY_UTC_OFFSET.get("US", -5)) >= 6]
            if not mismatched_countries:
                mismatched_countries = unique_geo_countries


        target_country = str(rng.choice(mismatched_countries))
        c_indices = np.where(geo_index.city_country == target_country)[0]
        if len(c_indices) == 0:
            c_indices = np.where(geo_index.city_country != "UNKNOWN")[0]

        m_idx = int(rng.choice(c_indices)) if len(c_indices) > 0 else 0
        wallet_overrides[wallet] = (target_country, m_idx)

    for idx, row in df.iterrows():
        row_addrs = _extract_addresses(row.get("input_addresses", []))
        matching_planted = [w for w in row_addrs if w in wallet_overrides]
        if matching_planted:
            w = matching_planted[0]
            target_country, m_idx = wallet_overrides[w]
            start_int = geo_index.city_starts[m_idx]
            end_int = geo_index.city_ends[m_idx]
            ip_int = int(rng.integers(start_int, end_int + 1))
            override_ip = str(ipaddress.IPv4Address(ip_int))
            df.at[idx, "src_ip"] = override_ip
            df.at[idx, "geo_country"] = target_country
            _, asn_list = geo_lookup.resolve_geo_batch([override_ip], geo_index)
            df.at[idx, "asn"] = asn_list[0]

    gt_path = Path(ground_truth_path or (config.PROCESSED_DIR / "geo_ground_truth.csv"))
    gt_path.parent.mkdir(parents=True, exist_ok=True)
    # Write full evasion metadata so Ankit's VPN Catcher can do blind validation.
    # CRITICAL: this file is written once here and never read back by any pipeline code.
    gt_rows = []
    for w in sorted(planted_wallets):
        claimed_country, _ = wallet_overrides.get(w, ("UNKNOWN", 0))
        peak_utc = int(round(float(np.mean(wallet_hours.get(w, [0]))))) % 24
        gt_rows.append({
            "wallet_id": w,
            "planted": True,
            "claimed_country": claimed_country,
            "peak_utc_hour": peak_utc,
        })
    gt_df = pd.DataFrame(gt_rows)
    gt_df.to_csv(gt_path, index=False)

    return df


def attach_network_layer(
    df: pd.DataFrame,
    rng: np.random.Generator | None = None,
    geo_index: geo_lookup.GeoIndex | None = None,
    plant_evasion: bool = True,
    evasion_ratio: float = 0.05,
    ground_truth_path: Path | str | None = None,
) -> pd.DataFrame:
    """Attach network layer (src_ip, dst_ip, src_port, dst_port, geo_country, asn) to df.

    Also handles Sprint 2 VPN Catcher evasion wallet planting and writes planted-wallet
    metadata to data/processed/geo_ground_truth.csv.
    """
    if rng is None:
        rng = np.random.default_rng(config.RANDOM_STATE)

    n = len(df)
    risky_pool = load_asn_ip_pool(config.RISKY_ASNS, config.GEOLITE_ASN_BLOCKS_CSV)
    residential_pool = load_asn_ip_pool(config.RESIDENTIAL_ASNS, config.GEOLITE_ASN_BLOCKS_CSV)
    # US-only residential sub-pool: Comcast (7922), AT&T (7018), Verizon (701).
    # Used to skew licit IPs ~80% toward US CIDRs so geo_country reaches ~82% US.
    us_residential_pool = load_asn_ip_pool([7922, 7018, 701], config.GEOLITE_ASN_BLOCKS_CSV)

    if geo_index is None:
        geo_index = geo_lookup.build_geo_index()

    labels = (
        df["label"].tolist()
        if "label" in df.columns
        else (df["class"].tolist() if "class" in df.columns else ["unknown"] * n)
    )

    src_ips = generate_ips_batch(labels, rng, risky_pool, residential_pool, us_residential_pool)
    dst_ips = generate_ips_batch(labels, rng, risky_pool, residential_pool, us_residential_pool)
    src_ports = generate_ports(n, rng)
    dst_ports = generate_ports(n, rng)

    geo_countries, asns = geo_lookup.resolve_geo_batch(src_ips, geo_index)

    df["src_ip"] = src_ips
    df["dst_ip"] = dst_ips
    df["src_port"] = src_ports
    df["dst_port"] = dst_ports
    df["geo_country"] = geo_countries
    df["asn"] = asns

    if plant_evasion:
        df = plant_geo_temporal_evasion(df, rng, geo_index, evasion_ratio, ground_truth_path)

    return df



