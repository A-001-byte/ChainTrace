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
    for i, cidr in enumerate(networks.to_numpy()):
        net = ipaddress.IPv4Network(cidr)
        starts[i] = int(net.network_address)
        ends[i] = int(net.broadcast_address)
    return starts, ends


def build_geo_index() -> GeoIndex:
    blocks = pd.read_csv(
        config.GEOLITE_CITY_BLOCKS_CSV,
        usecols=["network", "geoname_id", "registered_country_geoname_id"],
    )
    # Some rows lack a city-level geoname_id but do carry the registered-country one —
    # fall back to that so country resolution doesn't drop rows unnecessarily.
    blocks["geoname_id"] = blocks["geoname_id"].fillna(blocks["registered_country_geoname_id"])

    locations = pd.read_csv(config.GEOLITE_CITY_LOCATIONS_CSV, usecols=["geoname_id", "country_iso_code"])
    geoname_to_country = dict(zip(locations["geoname_id"], locations["country_iso_code"]))
    blocks["country_iso_code"] = blocks["geoname_id"].map(geoname_to_country).fillna(UNKNOWN)

    city_starts, city_ends = _cidr_bounds(blocks["network"])
    order = np.argsort(city_starts)
    city_starts = city_starts[order]
    city_ends = city_ends[order]
    city_country = blocks["country_iso_code"].to_numpy()[order]

    asn_blocks = pd.read_csv(
        config.GEOLITE_ASN_BLOCKS_CSV, usecols=["network", "autonomous_system_number"]
    )
    asn_starts, asn_ends = _cidr_bounds(asn_blocks["network"])
    order2 = np.argsort(asn_starts)
    asn_starts = asn_starts[order2]
    asn_ends = asn_ends[order2]
    asn_numbers = asn_blocks["autonomous_system_number"].to_numpy()[order2]

    return GeoIndex(city_starts, city_ends, city_country, asn_starts, asn_ends, asn_numbers)


def _resolve_column(ip_ints: np.ndarray, starts: np.ndarray, ends: np.ndarray, values: np.ndarray, fill):
    idx = np.searchsorted(starts, ip_ints, side="right") - 1
    idx_clipped = np.clip(idx, 0, len(starts) - 1)
    hit = (idx >= 0) & (ip_ints <= ends[idx_clipped])
    out = np.full(len(ip_ints), fill, dtype=object)
    out[hit] = values[idx_clipped[hit]]
    return out


def resolve_geo_batch(ips: list[str], index: GeoIndex) -> tuple[list, list]:
    """Resolve a batch of IPv4 strings to (country_iso_code, asn) lists.

    Unmatched IPs resolve to 'UNKNOWN' for both fields, per the task's
    resolve_geo_from_csv() spec.
    """
    ip_ints = np.array([int(ipaddress.IPv4Address(ip)) for ip in ips], dtype=np.int64)
    countries = _resolve_column(ip_ints, index.city_starts, index.city_ends, index.city_country, UNKNOWN)
    asns = _resolve_column(ip_ints, index.asn_starts, index.asn_ends, index.asn_numbers, UNKNOWN)
    return countries.tolist(), asns.tolist()
