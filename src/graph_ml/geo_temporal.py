"""Geo-Temporal Mismatch detector ("VPN Catcher") — USP 1.

Detects wallets whose CLAIMED GeoIP country (unified_dataset.csv's synthetic
network-layer geo_country) contradicts WHEN they are actually active. A wallet claiming
US but whose activity consistently peaks during Asia-Pacific business hours is behaving
like it's actually operating from Asia-Pacific, behind a VPN presenting a US exit IP.

BLINDNESS GUARANTEE — read before touching this file:
    This module reads ONLY data/processed/unified_dataset.csv. It must never read,
    import, or even name-check the separate ground-truth CSV a teammate's generator
    (src/data_pipeline/network_synth.py) writes to plant known evasion cases and validate
    this detector's hit rate. Only scripts/score_vpn_catcher.py is permitted to open that
    file — it scores this detector's *output* after the fact, never its internals. This
    split is the whole point: it's what turns "we detected our own generator" into a
    real, judge-defensible validation harness.

    This docstring deliberately never spells out that file's name, on purpose: the
    guarantee this module makes is checked by
    tests/graph_ml/test_geo_temporal.py::test_no_module_under_this_package_references_ground_truth_file,
    which greps every file in this package for that literal filename and fails on a
    match. Writing the name here — even just to explain the guarantee — would trip that
    same grep, which is exactly the point: there is no "it's just a comment" exception.

METHOD:
    1. Explode unified_dataset.csv's input_addresses/output_addresses (stringified Python
       lists) to get every wallet's set of transactions, in one pass over the file.
    2. Bucket each wallet's transaction timestamps by UTC hour-of-day, and take the modal
       geo_country across its transactions as its "claimed" country.
    3. Convert the wallet's UTC activity histogram into LOCAL hours under two competing
       hypotheses: (a) the claimed country's real UTC offset, and (b) every other known
       region's offset (COUNTRY_UTC_OFFSET's distinct values). Compare business-hours
       (9am-6pm) concentration under both.
    4. Flag when the claimed-country hypothesis explains little of the pattern (low
       business-hours concentration under the claim) AND a materially different region
       explains most of it (high concentration under that region) — the classic VPN
       tell: the traffic looks like someone working a normal day, just not in the
       timezone they claim to be in.

Offline, pathlib-only, no network calls. Reuses
src.data_pipeline.config.COUNTRY_UTC_OFFSET / UNIFIED_DATASET_CSV rather than
redefining them — this module owns none of that data, only the detection logic.
"""

from __future__ import annotations

import ast
import logging
from collections import Counter
from dataclasses import dataclass, field

import pandas as pd

from src.data_pipeline.config import COUNTRY_UTC_OFFSET, UNIFIED_DATASET_CSV

logger = logging.getLogger(__name__)

# --- Tunable thresholds (eyeballed against the real dataset, not fitted to any labeled
# set — this module never sees labels). See geo_temporal.py's __main__ block / the
# "flagged N of M wallets" log line for the actual empirical flag rate on real data. ---

MIN_TRANSACTIONS_FOR_SIGNAL = 3  # below this, a "peak" hour is noise, not a pattern
BUSINESS_HOUR_START = 9  # 9am local
BUSINESS_HOUR_END = 18  # 6pm local (exclusive) -> hours 9..17
MAX_CLAIMED_BUSINESS_FRACTION = 0.35  # claimed country must look implausible...
MIN_ALT_BUSINESS_FRACTION = 0.55  # ...while some other region looks very plausible
MIN_OFFSET_GAP_HOURS = 4  # candidate region must be a real timezone away, not
# neighboring-zone noise (e.g. claimed=+1 vs alt=+2 shouldn't count as a "mismatch")

# Hand-labeled from COUNTRY_UTC_OFFSET's own distinct offset values, purely for readable
# reason text ("Asia-Pacific business hours" reads better than "UTC+8 business hours").
# The assert below keeps this in sync if COUNTRY_UTC_OFFSET ever changes.
_OFFSET_REGION_NAMES = {
    -5: "North America",
    0: "UK / West Africa",
    1: "Western Europe",
    2: "Eastern Europe / North Africa",
    3: "Russia / East Africa",
    8: "Asia-Pacific",
    9: "Japan",
    10: "Australia",
}
assert set(_OFFSET_REGION_NAMES) == set(COUNTRY_UTC_OFFSET.values()), (
    "COUNTRY_UTC_OFFSET gained/lost a distinct offset value — "
    "update _OFFSET_REGION_NAMES in geo_temporal.py to match"
)


def _parse_address_list(value: object) -> list[str]:
    """unified_dataset.csv stores input_addresses/output_addresses as the string repr of
    a Python list, e.g. "['1Goo39...']". Same parsing approach already used elsewhere in
    this codebase (src.dashboard.components.alerts_table, src.graph_ml.intent_classifier)
    for the same columns — kept as a local copy rather than imported, so this module has
    zero import dependency on anything outside src/graph_ml (no accidental path to the
    ground-truth file via some other module's import chain).
    """
    if isinstance(value, list):
        return value
    if isinstance(value, str):
        stripped = value.strip()
        if stripped.startswith("["):
            try:
                parsed = ast.literal_eval(stripped)
                return [str(v) for v in parsed] if isinstance(parsed, list) else []
            except (ValueError, SyntaxError):
                return []
    return []


@dataclass
class WalletActivity:
    """Raw per-wallet observations, before any scoring — kept separate from the scoring
    step so build_wallet_activity_index() (the expensive single pass over the dataset)
    and _evaluate_wallet() (cheap, per-wallet) can be tested independently.
    """

    wallet_id: str
    utc_hour_counts: Counter = field(default_factory=Counter)
    country_counts: Counter = field(default_factory=Counter)

    @property
    def n_transactions(self) -> int:
        return sum(self.utc_hour_counts.values())


def build_wallet_activity_index(tx_df: pd.DataFrame) -> dict[str, WalletActivity]:
    """One pass over unified_dataset.csv: every wallet's UTC hour-of-day histogram and
    claimed-country tally, built by exploding input_addresses/output_addresses against
    that row's own timestamp/geo_country. O(n) single pass over the whole file — not a
    per-wallet rescan (that exact anti-pattern cost 925s elsewhere in this codebase before
    it was fixed; this module never does that).
    """
    index: dict[str, WalletActivity] = {}
    timestamps = pd.to_datetime(tx_df["timestamp"], errors="coerce")

    for row, ts in zip(tx_df.itertuples(index=False), timestamps):
        if pd.isna(ts):
            continue
        hour = ts.hour
        country = getattr(row, "geo_country", None)
        wallets = set(_parse_address_list(getattr(row, "input_addresses", None))) | set(
            _parse_address_list(getattr(row, "output_addresses", None))
        )
        for wallet_id in wallets:
            if not wallet_id:
                continue
            activity = index.setdefault(wallet_id, WalletActivity(wallet_id=wallet_id))
            activity.utc_hour_counts[hour] += 1
            if country:
                activity.country_counts[country] += 1

    logger.info("Indexed %d wallets from %d transaction rows", len(index), len(tx_df))
    return index


def _business_hour_fraction(utc_hour_counts: Counter, utc_offset: int) -> float:
    """Fraction of this wallet's activity that would fall in local business hours
    [BUSINESS_HOUR_START, BUSINESS_HOUR_END) if utc_offset were its true timezone.
    """
    total = sum(utc_hour_counts.values())
    if total == 0:
        return 0.0
    in_business = 0
    for utc_hour, count in utc_hour_counts.items():
        local_hour = (utc_hour + utc_offset) % 24
        if BUSINESS_HOUR_START <= local_hour < BUSINESS_HOUR_END:
            in_business += count
    return in_business / total


def _evaluate_wallet(activity: WalletActivity) -> dict:
    """Core scoring for one wallet. Returns every intermediate value used, not just the
    final flag/reason, so the join step and tests can inspect the reasoning — same
    explainability spirit as intent_classifier.EntitySignals.
    """
    result = {
        "wallet_id": activity.wallet_id,
        "n_transactions": activity.n_transactions,
        "claimed_country": None,
        "claimed_offset": None,
        "claimed_business_fraction": None,
        "alt_region": None,
        "alt_business_fraction": None,
        "geo_temporal_flag": False,
        "geo_temporal_reason": None,
    }

    if activity.n_transactions < MIN_TRANSACTIONS_FOR_SIGNAL or not activity.country_counts:
        return result  # too little data to trust any "peak" — honest non-flag, not a guess

    claimed_country, _ = activity.country_counts.most_common(1)[0]
    claimed_offset = COUNTRY_UTC_OFFSET.get(claimed_country)
    result["claimed_country"] = claimed_country
    result["claimed_offset"] = claimed_offset

    if claimed_offset is None:
        # COUNTRY_UTC_OFFSET only covers a fixed set of countries — we don't guess an
        # offset for the rest rather than fabricate false precision.
        return result

    claimed_frac = _business_hour_fraction(activity.utc_hour_counts, claimed_offset)
    result["claimed_business_fraction"] = round(claimed_frac, 3)

    if claimed_frac > MAX_CLAIMED_BUSINESS_FRACTION:
        return result  # claimed country already plausibly explains the pattern

    best_alt_offset, best_alt_frac = None, 0.0
    for offset in set(COUNTRY_UTC_OFFSET.values()):
        if offset == claimed_offset or abs(offset - claimed_offset) < MIN_OFFSET_GAP_HOURS:
            continue
        frac = _business_hour_fraction(activity.utc_hour_counts, offset)
        if frac > best_alt_frac:
            best_alt_offset, best_alt_frac = offset, frac

    if best_alt_offset is None or best_alt_frac < MIN_ALT_BUSINESS_FRACTION:
        return result

    alt_region = _OFFSET_REGION_NAMES[best_alt_offset]
    result["alt_region"] = alt_region
    result["alt_business_fraction"] = round(best_alt_frac, 3)
    result["geo_temporal_flag"] = True
    result["geo_temporal_reason"] = (
        f"claims {claimed_country}, but {best_alt_frac * 100:.0f}% of activity falls in "
        f"{alt_region} business hours"
    )
    return result


def detect_geo_temporal_mismatches(tx_df: pd.DataFrame | None = None) -> pd.DataFrame:
    """Main entry point. Reads ONLY unified_dataset.csv — either the tx_df passed in, or
    loaded from src.data_pipeline.config.UNIFIED_DATASET_CSV if not given. See the module
    docstring's blindness guarantee for what this function must never touch.

    Returns:
        DataFrame with one row per wallet observed in unified_dataset.csv, columns:
        wallet_id, geo_temporal_flag (bool), geo_temporal_reason (str | None), plus
        diagnostic columns (n_transactions, claimed_country, claimed_offset,
        claimed_business_fraction, alt_region, alt_business_fraction) kept for the join
        step and for debugging — callers that only need the flag/reason should select
        just those two columns.
    """
    if tx_df is None:
        tx_df = pd.read_csv(UNIFIED_DATASET_CSV)

    activity_index = build_wallet_activity_index(tx_df)
    rows = [_evaluate_wallet(activity) for activity in activity_index.values()]
    result_df = pd.DataFrame(rows)

    n_total = len(result_df)
    n_flagged = int(result_df["geo_temporal_flag"].sum()) if n_total else 0
    logger.info(
        "geo_temporal: flagged %d of %d wallets (%.2f%%)",
        n_flagged,
        n_total,
        (100 * n_flagged / n_total) if n_total else 0.0,
    )
    return result_df


def join_geo_temporal_onto_alerts(alerts_df: pd.DataFrame, geo_temporal_df: pd.DataFrame) -> pd.DataFrame:
    """Add geo_temporal_flag/geo_temporal_reason onto an already-built ranked_alerts.csv,
    matched by node_id, for wallet-type rows only.

    Every existing Contract B column (node_id, node_type, label, cluster_id,
    classifier_confidence, anomaly_score, risk_score, reason, intent_label,
    intent_confidence, ...) is left completely untouched — this only adds two new columns
    and returns a new DataFrame, never mutates the input.

    geo_temporal_flag/geo_temporal_reason are left as None (not False) for:
      - tx-type rows (this detector has no signal for transactions, only wallets), and
      - wallet-type rows whose address never appeared in unified_dataset.csv at all.
    A real False means "evaluated, and did not match the pattern" — kept distinct from
    "never evaluated" so a missing value can't be misread as a clean bill of health.
    """
    result = alerts_df.copy()
    # Two separate single-dtype Series lookups, not one row-wise DataFrame.loc[] slice —
    # slicing a whole row across a bool column and an object column forces pandas to pick
    # one common dtype for that row-Series, which silently turns a real None into NaN.
    # Indexing each column's own Series individually keeps None as None.
    flag_lookup = geo_temporal_df.set_index("wallet_id")["geo_temporal_flag"]
    reason_lookup = geo_temporal_df.set_index("wallet_id")["geo_temporal_reason"]

    flags: list[bool | None] = []
    reasons: list[str | None] = []
    for _, row in result.iterrows():
        node_id = str(row["node_id"])
        if row.get("node_type") != "wallet" or not node_id.startswith("wallet_"):
            flags.append(None)
            reasons.append(None)
            continue

        bare_address = node_id[len("wallet_") :]
        if bare_address in flag_lookup.index:
            flags.append(bool(flag_lookup.loc[bare_address]))
            reasons.append(reason_lookup.loc[bare_address])
        else:
            flags.append(None)
            reasons.append(None)

    result["geo_temporal_flag"] = flags
    result["geo_temporal_reason"] = reasons
    return result


if __name__ == "__main__":
    import sys

    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")

    from src.graph_ml.config import ALERTS_DIR

    geo_df = detect_geo_temporal_mismatches()

    alerts_path = ALERTS_DIR / "ranked_alerts.csv"
    if not alerts_path.exists():
        print(f"No {alerts_path} found — run the graph_ml pipeline with --save first.")
        sys.exit(1)

    alerts_df = pd.read_csv(alerts_path)
    joined = join_geo_temporal_onto_alerts(alerts_df, geo_df)
    joined.to_csv(alerts_path, index=False)
    print(f"Joined geo_temporal_flag/geo_temporal_reason onto {alerts_path}")
    print(f"  {int(joined['geo_temporal_flag'].sum())} of {len(joined)} alert rows flagged")
