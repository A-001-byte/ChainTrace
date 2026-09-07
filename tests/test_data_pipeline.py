"""Unit tests for src.data_pipeline (network_synth and geo_lookup)."""

from datetime import datetime
import ipaddress
import pytest
import numpy as np
import pandas as pd

from src.data_pipeline import config, geo_lookup, network_synth


@pytest.fixture
def rng():
    return np.random.default_rng(config.RANDOM_STATE)


@pytest.fixture
def mock_asn_csv(tmp_path):
    csv_file = tmp_path / "mock_asn.csv"
    df = pd.DataFrame(
        {
            "network": ["1.1.1.0/24", "2.2.2.0/24", "3.3.3.0/24"],
            "autonomous_system_number": [100, 200, 300],
        }
    )
    df.to_csv(csv_file, index=False)
    return csv_file


@pytest.fixture
def mock_geo_csvs(tmp_path):
    city_blocks = tmp_path / "GeoLite2-City-Blocks-IPv4.csv"
    city_locations = tmp_path / "GeoLite2-City-Locations-en.csv"
    asn_blocks = tmp_path / "GeoLite2-ASN-Blocks-IPv4.csv"

    pd.DataFrame(
        {
            "network": ["8.8.8.0/24", "1.1.1.0/24"],
            "geoname_id": [5375480, np.nan],
            "registered_country_geoname_id": [np.nan, 2077456],
        }
    ).to_csv(city_blocks, index=False)

    pd.DataFrame(
        {
            "geoname_id": [5375480, 2077456],
            "country_iso_code": ["US", "AU"],
        }
    ).to_csv(city_locations, index=False)

    pd.DataFrame(
        {
            "network": ["8.8.8.0/24", "1.1.1.0/24"],
            "autonomous_system_number": [15169, 13335],
        }
    ).to_csv(asn_blocks, index=False)

    return city_blocks, city_locations, asn_blocks


# --- network_synth tests ---

def test_load_asn_ip_pool(mock_asn_csv):
    pool = network_synth.load_asn_ip_pool([100, 300], mock_asn_csv)
    assert pool == ["1.1.1.0/24", "3.3.3.0/24"]

    with pytest.raises(ValueError, match="No CIDR blocks found"):
        network_synth.load_asn_ip_pool([999], mock_asn_csv)

    with pytest.raises(ValueError, match="ASNs list cannot be empty"):
        network_synth.load_asn_ip_pool([], mock_asn_csv)

    with pytest.raises(FileNotFoundError):
        network_synth.load_asn_ip_pool([100], "non_existent.csv")


def test_random_ip_from_pool(rng):
    pool = ["100.64.0.0/24"]
    ip_str = network_synth.random_ip_from_pool(pool, rng)
    ip_obj = ipaddress.IPv4Address(ip_str)
    net_obj = ipaddress.IPv4Network(pool[0])
    assert ip_obj in net_obj

    with pytest.raises(ValueError, match="cannot be empty"):
        network_synth.random_ip_from_pool([], rng)


def test_random_public_ipv4(rng):
    ip_str = network_synth.random_public_ipv4(rng)
    ip = ipaddress.IPv4Address(ip_str)
    assert ip.is_global
    assert not ip.is_multicast
    assert not ip.is_reserved


def test_generate_ip_label_normalization(rng):
    risky = ["1.1.1.0/24"]
    res = ["2.2.2.0/24"]

    # String labels
    ip1 = network_synth.generate_ip("illicit", rng, risky, res)
    ip2 = network_synth.generate_ip("licit", rng, risky, res)
    ip3 = network_synth.generate_ip("unknown", rng, risky, res)
    assert all(ipaddress.IPv4Address(ip).is_global for ip in [ip1, ip2, ip3])

    # Numeric / alternative labels
    ip4 = network_synth.generate_ip(1, rng, risky, res)
    ip5 = network_synth.generate_ip(0, rng, risky, res)
    ip6 = network_synth.generate_ip(-1, rng, risky, res)
    ip7 = network_synth.generate_ip(" ILLICIT ", rng, risky, res)
    assert all(ipaddress.IPv4Address(ip).is_global for ip in [ip4, ip5, ip6, ip7])


def test_generate_ips_batch(rng):
    labels = ["illicit", "licit", "unknown", 1, 0]
    risky = ["1.1.1.0/24"]
    res = ["2.2.2.0/24"]
    ips = network_synth.generate_ips_batch(labels, rng, risky, res)
    assert len(ips) == 5
    assert all(isinstance(ip, str) for ip in ips)


def test_generate_ports(rng):
    assert network_synth.generate_ports(0, rng) == []
    ports = network_synth.generate_ports(50, rng)
    assert len(ports) == 50
    valid_ports = set([config.PORT_MAIN] + config.PORT_ALTERNATIVES)
    assert all(p in valid_ports for p in ports)


def test_generate_timestamp(rng):
    ts = network_synth.generate_timestamp(1, rng)
    assert isinstance(ts, datetime)
    assert ts >= config.ANCHOR_DATE

    # Handling invalid/float timestep
    ts_invalid = network_synth.generate_timestamp(None, rng)
    assert isinstance(ts_invalid, datetime)


def test_generate_script_types(rng):
    assert network_synth.generate_script_types(0, rng) == []
    scripts = network_synth.generate_script_types(20, rng)
    assert len(scripts) == 20
    assert all(s in config.SCRIPT_TYPES for s in scripts)


# --- geo_lookup tests ---

def test_build_geo_index(mock_geo_csvs):
    city_b, city_l, asn_b = mock_geo_csvs
    index = geo_lookup.build_geo_index(city_b, city_l, asn_b)
    assert len(index.city_starts) == 2
    assert len(index.asn_starts) == 2


def test_resolve_geo_batch(mock_geo_csvs):
    city_b, city_l, asn_b = mock_geo_csvs
    index = geo_lookup.build_geo_index(city_b, city_l, asn_b)

    # 8.8.8.8 -> US, ASN 15169
    # 1.1.1.1 -> AU, ASN 13335
    # 9.9.9.9 -> UNKNOWN, UNKNOWN
    # invalid -> UNKNOWN, UNKNOWN
    test_ips = ["8.8.8.8", "1.1.1.1", "9.9.9.9", "not_an_ip", ""]
    countries, asns = geo_lookup.resolve_geo_batch(test_ips, index)

    assert countries == ["US", "AU", "UNKNOWN", "UNKNOWN", "UNKNOWN"]
    assert asns == [15169, 13335, "UNKNOWN", "UNKNOWN", "UNKNOWN"]


def test_resolve_geo_single(mock_geo_csvs):
    city_b, city_l, asn_b = mock_geo_csvs
    index = geo_lookup.build_geo_index(city_b, city_l, asn_b)

    country, asn = geo_lookup.resolve_geo_single("8.8.8.8", index)
    assert country == "US"
    assert asn == 15169

    country_unk, asn_unk = geo_lookup.resolve_geo_single("invalid_ip", index)
    assert country_unk == "UNKNOWN"
    assert asn_unk == "UNKNOWN"
