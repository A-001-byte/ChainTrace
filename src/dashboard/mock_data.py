"""ChainTrace Mock Data Generator.

Generates realistic synthetic datasets for Bitcoin transaction metadata and ML pipeline
ranked alerts output matching the project schema specifications.
"""

from __future__ import annotations

import json
import random
import time
from datetime import datetime, timedelta, timezone

import numpy as np
import pandas as pd

# Standard countries and ASNs for realistic network metadata
RISKY_COUNTRIES = ["Romania", "Netherlands", "Russia", "Panama", "Seychelles", "Ukraine", "Belize"]
STANDARD_COUNTRIES = ["United States", "Germany", "United Kingdom", "Canada", "France", "Japan", "Switzerland"]

RISKY_ASNS = [
    "AS60068 Datacamp Limited",
    "AS9009 M247 Ltd",
    "AS20473 Choopa LLC",
    "AS200599 Hivelocity Inc.",
    "AS202425 IP Volume Inc.",
    "AS212238 Stark Industries Solutions",
]

STANDARD_ASNS = [
    "AS13335 Cloudflare Inc.",
    "AS14061 DigitalOcean LLC",
    "AS7922 Comcast Cable",
    "AS3320 Deutsche Telekom AG",
    "AS16509 Amazon.com Inc.",
    "AS15169 Google LLC",
]

SCRIPT_TYPES = ["P2PKH", "P2SH", "P2WPKH", "Taproot"]

EXPLANATION_PATTERNS = [
    "High out-degree ratio ({deg}); Tor exit node relay; Illicit cluster neighbor ratio ({ratio}%)",
    "Rapid peeling chain pattern; High velocity hops ({hops}/min); Anomaly score top 1%",
    "Mixer/tumbler interaction detected; Multi-input address reuse ({reuse} addresses)",
    "Unusual IP hop frequency ({freq}s); High transaction fee ratio; Cluster link score {score}",
    "High-risk ASN origin ({asn}); Fan-out transaction structure; Classifier confidence {conf}%",
    "Cyclic transaction graph loop; Darknet marketplace deposit pattern; Isolation Forest score {anom}",
    "CoinJoin structure anomaly; Zero-delay output forwarding; Cluster density {ratio}%",
]


def _random_ip(is_risky: bool = False) -> str:
    """Generate a realistic IPv4 address."""
    if is_risky:
        prefixes = [(185, 220), (194, 26), (45, 154), (193, 27), (109, 70)]
        p1, p2 = random.choice(prefixes)
        return f"{p1}.{p2}.{random.randint(1, 254)}.{random.randint(1, 254)}"
    else:
        return f"{random.randint(11, 172)}.{random.randint(1, 254)}.{random.randint(1, 254)}.{random.randint(1, 254)}"


def _random_btc_address(prefix: str = "bc1q") -> str:
    """Generate a mock Bitcoin wallet address."""
    chars = "0123456789abcdefghijklmnopqrstuvwxyz"
    if prefix == "bc1q":
        return "bc1q" + "".join(random.choices(chars, k=38))
    elif prefix == "1":
        chars_b58 = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz"
        return "1" + "".join(random.choices(chars_b58, k=33))
    else:
        chars_b58 = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz"
        return "3" + "".join(random.choices(chars_b58, k=33))


def generate_mock_transactions(count: int = 350, seed: int = 42) -> pd.DataFrame:
    """Generate mock transaction dataset matching Section 4d blueprint schema.

    Returns DataFrame with columns:
    txid, timestamp, src_ip, dst_ip, src_port, dst_port, input_addresses,
    output_addresses, input_amounts, output_amounts, fee, script_type, geo_country, asn
    """
    random.seed(seed)
    np.random.seed(seed)

    start_time = datetime.now(timezone.utc) - timedelta(days=3)
    rows = []

    for i in range(count):
        is_risky = random.random() < 0.20
        txid = f"tx_{random.randint(100000, 999999):x}{random.randint(1000, 9999):x}"
        ts = (start_time + timedelta(minutes=random.randint(1, 4320))).strftime("%Y-%m-%dT%H:%M:%SZ")

        src_ip = _random_ip(is_risky)
        dst_ip = _random_ip(is_risky)
        src_port = random.choice([8333, random.randint(30000, 65500)])
        dst_port = 8333

        num_inputs = random.randint(1, 4) if not is_risky else random.randint(3, 8)
        num_outputs = random.randint(1, 3) if not is_risky else random.randint(2, 10)

        addr_prefix = random.choice(["bc1q", "1", "3"])
        input_addrs = [_random_btc_address(addr_prefix) for _ in range(num_inputs)]
        output_addrs = [_random_btc_address(random.choice(["bc1q", "3"])) for _ in range(num_outputs)]

        # BTC amounts
        base_amt = round(random.uniform(0.05, 12.5), 4)
        input_amts = [round(base_amt / num_inputs + random.uniform(0.001, 0.05), 4) for _ in range(num_inputs)]
        total_in = sum(input_amts)
        fee = round(random.uniform(0.0001, 0.0025), 5)
        total_out = total_in - fee

        output_amts = [round(total_out / num_outputs, 4) for _ in range(num_outputs)]
        # fix slight rounding difference on last output
        output_amts[-1] = round(output_amts[-1] + (total_out - sum(output_amts)), 4)

        country = random.choice(RISKY_COUNTRIES) if is_risky else random.choice(STANDARD_COUNTRIES)
        asn = random.choice(RISKY_ASNS) if is_risky else random.choice(STANDARD_ASNS)
        script_type = random.choice(SCRIPT_TYPES)

        rows.append(
            {
                "txid": txid,
                "timestamp": ts,
                "src_ip": src_ip,
                "dst_ip": dst_ip,
                "src_port": src_port,
                "dst_port": dst_port,
                "input_addresses": json.dumps(input_addrs),
                "output_addresses": json.dumps(output_addrs),
                "input_amounts": json.dumps(input_amts),
                "output_amounts": json.dumps(output_amts),
                "fee": fee,
                "script_type": script_type,
                "geo_country": country,
                "asn": asn,
            }
        )

    return pd.DataFrame(rows)


def generate_mock_alerts(tx_df: pd.DataFrame | None = None, count: int = 45, seed: int = 42) -> pd.DataFrame:
    """Generate mock ranked ML pipeline alert output.

    Returns DataFrame with columns:
    node_id, node_type, risk_score, classifier_confidence, anomaly_score,
    cluster_id, reason, label, geo_country, asn
    """
    random.seed(seed)
    np.random.seed(seed)

    clusters = [f"Cluster #{c:02d}" for c in range(1, 11)]
    rows = []

    # Shared pool of wallet addresses linked to clusters
    cluster_wallets = {}
    for c in clusters:
        cluster_wallets[c] = [_random_btc_address(random.choice(["bc1q", "1", "3"])) for _ in range(6)]

    for i in range(count):
        node_type = random.choice(["wallet", "wallet", "wallet", "tx"])
        cluster = random.choice(clusters)

        if node_type == "wallet":
            node_id = random.choice(cluster_wallets[cluster])
        else:
            if tx_df is not None and len(tx_df) > 0:
                node_id = str(random.choice(tx_df["txid"].tolist()))
            else:
                node_id = f"tx_{random.randint(100000, 999999):x}"

        # Risk score calculation formula matching ML pipeline blend
        clf_conf = round(random.uniform(0.60, 0.98), 4)
        anom_score = round(random.uniform(0.55, 0.96), 4)
        cluster_bonus = round(random.uniform(0.05, 0.15), 4)

        blended_risk = min(0.9999, round(0.55 * clf_conf + 0.35 * anom_score + cluster_bonus, 4))

        # Ground truth label
        if blended_risk > 0.85:
            label = random.choice(["illicit", "illicit", "unknown"])
        elif blended_risk > 0.70:
            label = random.choice(["illicit", "unknown", "unknown"])
        else:
            label = random.choice(["licit", "unknown"])

        # Reason text generation
        tmpl = random.choice(EXPLANATION_PATTERNS)
        reason = tmpl.format(
            deg=round(random.uniform(0.75, 0.98), 2),
            ratio=random.randint(70, 99),
            hops=random.randint(12, 45),
            reuse=random.randint(4, 16),
            freq=random.randint(2, 15),
            score=round(random.uniform(0.80, 0.97), 2),
            asn=random.choice(RISKY_ASNS).split()[0],
            conf=int(clf_conf * 100),
            anom=anom_score,
        )

        country = random.choice(RISKY_COUNTRIES) if blended_risk > 0.75 else random.choice(STANDARD_COUNTRIES)
        asn = random.choice(RISKY_ASNS) if blended_risk > 0.75 else random.choice(STANDARD_ASNS)

        rows.append(
            {
                "node_id": node_id,
                "node_type": node_type,
                "risk_score": blended_risk,
                "classifier_confidence": clf_conf,
                "anomaly_score": anom_score,
                "cluster_id": cluster,
                "reason": reason,
                "label": label,
                "geo_country": country,
                "asn": asn,
            }
        )

    df = pd.DataFrame(rows).sort_values("risk_score", ascending=False).reset_index(drop=True)
    return df
