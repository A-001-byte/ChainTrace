"""Synthetic network layer: label-correlated IPs, ports, and timestamps.

Illicit-labeled transactions are weighted toward real CIDR blocks announced by
hosting/VPN/Tor-friendly ASNs; licit-labeled transactions are weighted toward real CIDR
blocks announced by large residential ISPs. Both pools are read from the team's real
GeoLite2-ASN-Blocks-IPv4.csv at load time — the ASN *list* is a documented placeholder
(see config.py), but every IP generated sits inside a real, currently-announced block for
that ASN, not a hand-guessed range.
"""

from __future__ import annotations

import ipaddress
from datetime import timedelta

import numpy as np
import pandas as pd

from . import config


def load_asn_ip_pool(asns: list[int], asn_blocks_csv) -> list[str]:
    """Return every CIDR block announced by the given ASNs, as strings."""
    df = pd.read_csv(asn_blocks_csv, usecols=["network", "autonomous_system_number"])
    matched = df[df["autonomous_system_number"].isin(asns)]
    if matched.empty:
        raise ValueError(f"No CIDR blocks found for ASNs {asns} in {asn_blocks_csv}")
    return matched["network"].tolist()


def _random_ip_in_cidr(cidr: str, rng: np.random.Generator) -> str:
    net = ipaddress.IPv4Network(cidr)
    offset = int(rng.integers(0, net.num_addresses))
    return str(net.network_address + offset)


def random_ip_from_pool(pool: list[str], rng: np.random.Generator) -> str:
    cidr = pool[int(rng.integers(0, len(pool)))]
    return _random_ip_in_cidr(cidr, rng)


def random_public_ipv4(rng: np.random.Generator) -> str:
    while True:
        ip = ipaddress.IPv4Address(int(rng.integers(1, 2**32 - 1)))
        if ip.is_global and not ip.is_multicast and not ip.is_reserved:
            return str(ip)


def generate_ip(label: str, rng: np.random.Generator, risky_pool: list[str], residential_pool: list[str]) -> str:
    """label is graph_ml's normalized string class: 'illicit' | 'licit' | 'unknown'.

    illicit: 60% risky-ASN IP, 40% uniform random public.
    licit:   80% residential-ASN IP, 20% uniform random public.
    unknown: not specified by the task brief — falls back to uniform random public
             (same as the labeled "random" branch), flagged as a confirmed default
             rather than a silent guess (~65% of Elliptic transactions are unlabeled).
    """
    if label == "illicit":
        return random_ip_from_pool(risky_pool, rng) if rng.random() < 0.6 else random_public_ipv4(rng)
    if label == "licit":
        return random_ip_from_pool(residential_pool, rng) if rng.random() < 0.8 else random_public_ipv4(rng)
    return random_public_ipv4(rng)


def generate_ports(n: int, rng: np.random.Generator) -> list[int]:
    use_main = rng.random(n) < config.PORT_MAIN_PROB
    alternatives = rng.choice(config.PORT_ALTERNATIVES, size=n)
    ports = np.where(use_main, config.PORT_MAIN, alternatives)
    return ports.tolist()


def generate_timestamp(time_step: int, rng: np.random.Generator):
    window_start = config.ANCHOR_DATE + timedelta(days=(int(time_step) - 1) * config.TIME_STEP_DAYS)
    jitter = timedelta(seconds=int(rng.integers(0, config.TIME_STEP_DAYS * 24 * 3600)))
    return window_start + jitter


def generate_script_types(n: int, rng: np.random.Generator) -> list[str]:
    return rng.choice(config.SCRIPT_TYPES, size=n, p=config.SCRIPT_TYPE_WEIGHTS).tolist()
