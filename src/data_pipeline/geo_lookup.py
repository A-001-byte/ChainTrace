"""CSV-based GeoIP resolver (GeoLite2-City + GeoLite2-ASN CSV exports).

The team's task brief specifically calls for the CSV exports rather than the .mmdb
binaries (easier for every teammate to inspect/regenerate without extra tooling). MaxMind's
CSV blocks partition IPv4 space into non-overlapping CIDR networks — this builds a single
sorted (start_int, end_int) index per file and resolves any IP with a vectorized
np.searchsorted, so all ~400k src/dst lookups run in well under a second instead of
scanning ~3.7M / ~667k rows per IP.
"""

from __future__ import annotations

import ipaddress
from dataclasses import dataclass
from pathlib import Path

import numpy as np
import pandas as pd

from . import config

UNKNOWN = "UNKNOWN"


@dataclass
class GeoIndex:
    city_starts: np.ndarray
    city_ends: np.ndarray
    city_country: np.ndarray  # country_iso_code per block, aligned with city_starts

    asn_starts: np.ndarray
    asn_ends: np.ndarray
    asn_numbers: np.ndarray  # aligned with asn_starts


def _cidr_bounds(networks: pd.Series) -> tuple[np.ndarray, np.ndarray]:
    starts = np.empty(len(networks), dtype=np.int64)
    ends = np.empty(len(networks), dtype=np.int64)
    valid_count = 0
    for cidr in networks.to_numpy():
        if pd.isna(cidr):
            continue
        try:
            net = ipaddress.IPv4Network(str(cidr).strip(), strict=False)
            starts[valid_count] = int(net.network_address)
            ends[valid_count] = int(net.broadcast_address)
            valid_count += 1
        except (ValueError, TypeError, AttributeError):
            continue
    return starts[:valid_count], ends[:valid_count]


def build_geo_index(
    city_blocks_csv: str | Path | None = None,
    city_locations_csv: str | Path | None = None,
    asn_blocks_csv: str | Path | None = None,
) -> GeoIndex:
    city_blocks_path = Path(city_blocks_csv or config.GEOLITE_CITY_BLOCKS_CSV)
    city_locations_path = Path(city_locations_csv or config.GEOLITE_CITY_LOCATIONS_CSV)
    asn_blocks_path = Path(asn_blocks_csv or config.GEOLITE_ASN_BLOCKS_CSV)

    for p, desc in [
        (city_blocks_path, "City blocks CSV"),
        (city_locations_path, "City locations CSV"),
        (asn_blocks_path, "ASN blocks CSV"),
    ]:
        if not p.exists():
            raise FileNotFoundError(f"{desc} not found at {p}")

    blocks = pd.read_csv(
        city_blocks_path,
        usecols=["network", "geoname_id", "registered_country_geoname_id"],
    )
    blocks = blocks.dropna(subset=["network"])
    # Some rows lack a city-level geoname_id but do carry the registered-country one —
    # fall back to that so country resolution doesn't drop rows unnecessarily.
    blocks["geoname_id"] = blocks["geoname_id"].fillna(blocks["registered_country_geoname_id"])

    locations = pd.read_csv(city_locations_path, usecols=["geoname_id", "country_iso_code"])
    geoname_to_country = dict(zip(locations["geoname_id"], locations["country_iso_code"]))
    blocks["country_iso_code"] = blocks["geoname_id"].map(geoname_to_country).fillna(UNKNOWN)

    city_starts, city_ends = _cidr_bounds(blocks["network"])
    if len(city_starts) > 0:
        order = np.argsort(city_starts)
        city_starts = city_starts[order]
        city_ends = city_ends[order]
        city_country = blocks["country_iso_code"].to_numpy()[: len(city_starts)][order]
    else:
        city_starts = np.array([], dtype=np.int64)
        city_ends = np.array([], dtype=np.int64)
        city_country = np.array([], dtype=object)

    asn_blocks = pd.read_csv(
        asn_blocks_path, usecols=["network", "autonomous_system_number"]
    )
    asn_blocks = asn_blocks.dropna(subset=["network"])
    asn_starts, asn_ends = _cidr_bounds(asn_blocks["network"])
    if len(asn_starts) > 0:
        order2 = np.argsort(asn_starts)
        asn_starts = asn_starts[order2]
        asn_ends = asn_ends[order2]
        asn_numbers = asn_blocks["autonomous_system_number"].to_numpy()[: len(asn_starts)][order2]
    else:
        asn_starts = np.array([], dtype=np.int64)
        asn_ends = np.array([], dtype=np.int64)
        asn_numbers = np.array([], dtype=object)

    return GeoIndex(city_starts, city_ends, city_country, asn_starts, asn_ends, asn_numbers)


def _resolve_column(ip_ints: np.ndarray, starts: np.ndarray, ends: np.ndarray, values: np.ndarray, fill):
    out = np.full(len(ip_ints), fill, dtype=object)
    if len(starts) == 0 or len(ip_ints) == 0:
        return out

    valid_mask = ip_ints >= 0
    if not np.any(valid_mask):
        return out

    valid_ips = ip_ints[valid_mask]
    idx = np.searchsorted(starts, valid_ips, side="right") - 1
    idx_clipped = np.clip(idx, 0, len(starts) - 1)
    hit = (idx >= 0) & (valid_ips <= ends[idx_clipped])

    out_valid = np.full(len(valid_ips), fill, dtype=object)
    out_valid[hit] = values[idx_clipped[hit]]
    out[valid_mask] = out_valid
    return out


def _safe_ip_to_int(ip: str | None) -> int:
    if not ip or not isinstance(ip, str):
        return -1
    try:
        return int(ipaddress.IPv4Address(ip.strip()))
    except (ValueError, TypeError, AttributeError):
        return -1


def resolve_geo_batch(ips: list[str], index: GeoIndex) -> tuple[list, list]:
    """Resolve a batch of IPv4 strings to (country_iso_code, asn) lists.

    Unmatched or malformed IPs resolve to 'UNKNOWN' for both fields.
    """
    ip_ints = np.array([_safe_ip_to_int(ip) for ip in ips], dtype=np.int64)
    countries = _resolve_column(ip_ints, index.city_starts, index.city_ends, index.city_country, UNKNOWN)
    asns = _resolve_column(ip_ints, index.asn_starts, index.asn_ends, index.asn_numbers, UNKNOWN)
    return countries.tolist(), asns.tolist()


def resolve_geo_single(ip: str, index: GeoIndex) -> tuple[str, str | int]:
    """Resolve a single IPv4 string to (country_iso_code, asn)."""
    countries, asns = resolve_geo_batch([ip], index)
    return countries[0], asns[0]

