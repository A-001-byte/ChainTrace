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
    licit:   70% US-residential-ASN IP (Comcast/AT&T/Verizon CIDRs), 30% random public.
             (No hardcoded target for geo_country % — let it emerge naturally from data.)
    unknown: uniform random public
    """
    norm_label = _normalize_label(label)
    if norm_label == "illicit":
        if risky_pool and rng.random() < 0.6:
            return random_ip_from_pool(risky_pool, rng)
        return random_public_ipv4(rng)
    if norm_label == "licit":
        # Draw from US-residential pool at P=0.70 (no hardcoded target).
        # Let geo_country % fall naturally from actual GeoLite2 data.
        pool = us_residential_pool if us_residential_pool else residential_pool
        if pool and rng.random() < 0.70:
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

    For licit transactions, draws from us_residential_pool at P=0.70
    (Comcast 7922, AT&T 7018, Verizon 701).
    Geo_country % emerges naturally from GeoLite2 data, no hardcoded target.
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

    # Build maps of wallets by label for proportional planting.
    # Plant across BOTH licit and illicit wallets in proportion to their prevalence.
    # This ensures fair blind validation: a detector flagging illicit wallets won't
    # achieve inflated recall just by catching planted evaders (every planted evader
    # won't be illicit).
    licit_wallet_ids: set[str] = set()
    illicit_wallet_ids: set[str] = set()
    
    licit_label_rows = df[df["label"].apply(_normalize_label) == "licit"]
    for _, row in licit_label_rows.iterrows():
        for addr in _extract_addresses(row.get("input_addresses", [])):
            if addr in wallet_hours:
                licit_wallet_ids.add(addr)
    
    illicit_label_rows = df[df["label"].apply(_normalize_label) == "illicit"]
    for _, row in illicit_label_rows.iterrows():
        for addr in _extract_addresses(row.get("input_addresses", [])):
            if addr in wallet_hours:
                illicit_wallet_ids.add(addr)
    
    # Plant proportionally: if 60% of active wallets are illicit, plant ~60% of
    # evaders into illicit wallets and ~40% into licit wallets.
    total_labeled = len(licit_wallet_ids) + len(illicit_wallet_ids)
    n_plant = max(1, int(len(active_wallets) * evasion_ratio))
    
    if total_labeled > 0:
        illicit_ratio = len(illicit_wallet_ids) / total_labeled
        n_illicit_plant = int(n_plant * illicit_ratio)
        n_licit_plant = n_plant - n_illicit_plant
    else:
        # Fallback if no labeled wallets
        n_illicit_plant = n_plant // 2
        n_licit_plant = n_plant - n_illicit_plant
    
    planted_wallets = set()
    if illicit_wallet_ids:
        planted_wallets.update(
            rng.choice(
                sorted(illicit_wallet_ids),
                size=min(n_illicit_plant, len(illicit_wallet_ids)),
                replace=False
            )
        )
    if licit_wallet_ids:
        planted_wallets.update(
            rng.choice(
                sorted(licit_wallet_ids),
                size=min(n_licit_plant, len(licit_wallet_ids)),
                replace=False
            )
        )

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
    n_illicit_planted = 0
    n_licit_planted = 0
    for w in sorted(planted_wallets):
        claimed_country, _ = wallet_overrides.get(w, ("UNKNOWN", 0))
        peak_utc = int(round(float(np.mean(wallet_hours.get(w, [0]))))) % 24
        # Determine if this wallet was planted in illicit or licit pool
        wallet_label = "illicit" if w in illicit_wallet_ids else "licit"
        if wallet_label == "illicit":
            n_illicit_planted += 1
        else:
            n_licit_planted += 1
        gt_rows.append({
            "wallet_id": w,
            "planted": True,
            "claimed_country": claimed_country,
            "peak_utc_hour": peak_utc,
            "original_label": wallet_label,
        })
    gt_df = pd.DataFrame(gt_rows)
    gt_df.to_csv(gt_path, index=False)
    
    # Log planting summary
    total_planted = len(planted_wallets)
    pct_illicit = 100.0 * n_illicit_planted / total_planted if total_planted > 0 else 0
    pct_licit = 100.0 * n_licit_planted / total_planted if total_planted > 0 else 0
    print(f"\n[VPN Catcher Ground Truth] Planted {total_planted} evaders among {len(active_wallets)} wallets:")
    print(f"  {n_illicit_planted} illicit ({pct_illicit:.1f}%) + {n_licit_planted} licit ({pct_licit:.1f}%)")
    print(f"  Ground truth written to {gt_path}")

    return df


def attach_network_layer(
    df: pd.DataFrame,
    rng: np.random.Generator | None = None,
    geo_index: geo_lookup.GeoIndex | None = None,
    plant_evasion: bool = True,
    evasion_ratio: float = 0.05,
    ground_truth_path: Path | str | None = None,
) -> pd.DataFrame:
    """Attach the synthetic network layer to a Contract A dataframe.

    Evasion planting is enabled by default: it is the production behavior, not an
    opt-in experiment. The VPN Catcher USP's blind-validation harness
    (scripts/score_vpn_catcher.py) needs data/processed/geo_ground_truth.csv to exist
    after a normal pipeline run, and this is the only place that file gets written.
    Planting itself never touches Contract A's column list — it only writes the
    separate ground-truth CSV alongside it.
    """
    if rng is None:
        rng = np.random.default_rng(config.RANDOM_STATE)

    n = len(df)
    risky_pool = load_asn_ip_pool(config.RISKY_ASNS, config.GEOLITE_ASN_BLOCKS_CSV)
    residential_pool = load_asn_ip_pool(config.RESIDENTIAL_ASNS, config.GEOLITE_ASN_BLOCKS_CSV)
    # US-only residential sub-pool: Comcast (7922), AT&T (7018), Verizon (701).
    # Licit transactions draw from this pool at P=0.70 (see generate_ip()); there is
    # no fixed geo_country % target — the resulting country mix emerges from actual
    # GeoLite2 data for whichever CIDRs get drawn.
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



