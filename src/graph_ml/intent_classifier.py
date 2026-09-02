"""Intent classification: a rule-based archetype matcher layered on top of Phase 2's
already-flagged illicit entities.

WHAT THIS IS NOT, and why that distinction matters for the pitch:
    This is NOT a classifier trained on labeled crime-type data. Elliptic/Elliptic++ only
    carry illicit/licit/unknown labels — there is no ground-truth "this wallet is
    ransomware vs darknet-market vs sanctions-evasion" anywhere in our dataset, and no
    public Bitcoin dataset we're aware of has one at the scale needed to train a real
    classifier. If asked where the crime-type labels came from: they didn't come from
    training data at all.

WHAT THIS IS:
    A heuristic pattern matcher. We define three measurable structural signals per
    already-flagged entity (fan-in/fan-out shape, timing burst pattern, hop-chain depth),
    match them against named signatures built from published research on how these crime
    types are known to move money (see each signature's docstring for the citation-style
    reasoning), and score how well an entity fits each one. An entity that doesn't clearly
    fit any signature gets an honest fallback label instead of a forced, false-confident
    match — a genuine "Pattern unclear" result is more defensible than a fake one.

WHERE THE SIGNALS COME FROM (reused, not recomputed):
    - Fan-in/fan-out: from the edge_type attribute already set on every edge in the
      graph_ml graph (graph_builder.py) — "addr_tx"/"tx_addr" edges already distinguish a
      wallet's outgoing-funding vs incoming-payment edges, and a tx's inputs vs outputs.
      No degree columns exist in Person A's unified_dataset.csv (verified — they don't),
      so this reads directly off the same graph object Phase 2 already built, per the
      "reuse the graph, don't rebuild it" requirement.
    - Timing burst pattern: from Person A's unified_dataset.csv `timestamp` column
      (data/processed/unified_dataset.csv) when it's present — richer, real-calendar-time
      granularity than Elliptic's own 49 discrete time_step buckets. If that file isn't
      available, this signal honestly reports "insufficient signal" rather than faking a
      coarse substitute.
    - Hop-chain depth: multi-source BFS (single O(V+E) pass over the same graph object)
      from the tx nodes at the graph's earliest time_step — a genuine, already-present
      temporal signal, used as the "likely origin" set for measuring how many hops removed
      a flagged entity is from the earliest known point in the trace.

Called after ranked_alerts.csv already exists (via run_phase2.py, after build_ranked_alerts()
has produced the alerts DataFrame) — this module only adds columns to that DataFrame, it
never feeds back into the classifier/anomaly-detection/clustering stages.

CALIBRATION STATUS OF THE NUMERIC THRESHOLDS BELOW — read before quoting a number in the
pitch, or if asked "how were these tuned":
    Every threshold in this file (burst/patient-gap hour cutoffs, fan-ratio splits,
    hop-depth percentile bands, per-criterion weights, MIN_CONFIDENT_MATCH_SCORE) is a
    judgment call, not a value fitted or validated against labeled cases — there is no
    labeled crime-archetype dataset to validate against, which is the same reason this is
    a rule-based matcher rather than a trained model in the first place. They're consistent
    with the *qualitative* shape each signature's docstring describes (e.g. "ransomware =
    burst + fan-in"), but the specific numbers (is a burst 48 hours or 12? is 0.5 the right
    fan-in cutoff or should it be 0.6?) are illustrative defaults, not calibrated ones.

    If a domain expert or a labeled sample ever becomes available, the two levers that most
    directly control how many entities get a confident archetype label vs. fall to "Pattern
    unclear" — and so the ones most worth validating first — are:
      1. The hop-depth percentile bands (search HOP_DEPTH_SHALLOW_MAX_PERCENTILE below) —
         these are relative to whatever batch is being scored, so the same wallet could
         land in a different band depending on how many alerts are in the run.
      2. MIN_CONFIDENT_MATCH_SCORE (currently 0.6) — this single number is the whole
         confident-match-vs-fallback boundary; moving it up or down directly trades off how
         often "Pattern unclear" fires against how often a possibly-wrong archetype label
         does.
    Everything else (burst/patient-gap hours, fan-ratio splits, per-criterion weights)
    matters too, but changing either of the two above will move the label distribution
    further, faster, than any other single change.
"""

from __future__ import annotations

import logging
from collections import deque
from dataclasses import dataclass, field

import networkx as nx
import pandas as pd

logger = logging.getLogger(__name__)

# --- Eyeballed thresholds, not validated against labeled cases (see the module docstring's
# "CALIBRATION STATUS" section) — the two below are the highest-leverage ones to revisit
# first if a domain expert or labeled sample ever becomes available. ---

# Below this, an archetype's total match score doesn't count as a confident match —
# below-bar entities fall to "Pattern unclear" instead of being forced into whichever
# signature happened to score highest. This single number is the whole confident-match-
# vs-fallback boundary: raising it pushes more entities into "Pattern unclear", lowering it
# pushes more into a (possibly wrong) archetype label.
MIN_CONFIDENT_MATCH_SCORE = 0.6

# Hop-depth percentile bands used by the three archetype scorers below. Relative to
# whatever batch is being scored (top-50, top-500, ...), not a fixed absolute depth — so
# the same wallet could land in a different band depending on how many alerts are in the
# run. Named here instead of left as inline numbers so they're one place to tune, and so
# the module docstring's pointer to them is a real one.
HOP_DEPTH_SHALLOW_MAX_PERCENTILE = 60  # ransomware: "shallow-to-moderate" ceiling
HOP_DEPTH_MODERATE_MIN_PERCENTILE = 30  # darknet: "moderate" band floor
HOP_DEPTH_MODERATE_MAX_PERCENTILE = 70  # darknet: "moderate" band ceiling
HOP_DEPTH_DEEP_MIN_PERCENTILE = 70  # sanctions-evasion: "deliberately high" floor
WALLET_AMOUNT_HIGH_MIN_PERCENTILE = 70  # sanctions-evasion: "high individual amounts" floor

# Below this many timestamped events for an entity, timing signal is too thin to trust
# (can't distinguish "burst" from "spread" from a single data point).
MIN_EVENTS_FOR_TIMING_SIGNAL = 2


@dataclass
class EntitySignals:
    """The three raw structural measurements for one flagged entity, plus the population
    percentiles they're compared against — kept together so match_archetype() and the
    explanation text always agree on what was actually measured.
    """

    node_id: str
    node_type: str

    fan_in: int
    fan_out: int
    fan_ratio: float | None  # (fan_in - fan_out) / (fan_in + fan_out); None if both are 0

    n_timed_events: int
    span_hours: float | None
    median_gap_hours: float | None
    events_per_hour: float | None
    timing_pattern: str  # "burst" | "spread" | "patient_gaps" | "insufficient"

    hop_depth: int | None  # None if unreachable from every origin candidate

    wallet_avg_btc_amount: float | None  # only meaningful for node_type == "wallet"

    # Percentile (0-100) of this entity's value among all classified entities this run —
    # used for "moderate"/"high"/"low" framing instead of hardcoded absolute thresholds,
    # since the right absolute scale depends on how much of the graph was subsampled.
    hop_depth_percentile: float | None = None
    wallet_amount_percentile: float | None = None


@dataclass
class ArchetypeMatch:
    label: str
    confidence: float
    explanation: str
    matched_criteria: list[str] = field(default_factory=list)


# ---------------------------------------------------------------------------
# Signal computation — all reused from the already-built graph_ml graph and, when
# present, Person A's unified_dataset.csv. Nothing here recomputes classifier/anomaly
# scores or touches data_pipeline.py.
# ---------------------------------------------------------------------------


def _fan_in_out(graph: nx.Graph, node_id: str) -> tuple[int, int]:
    """Count this node's incoming-payment edges vs outgoing-funding edges, from the
    edge_type attribute graph_builder.py already sets on every edge.

    For a wallet node: fan_in = "tx_addr" edges (transactions that paid this wallet),
    fan_out = "addr_tx" edges (transactions this wallet funded).
    For a tx node: fan_in = "addr_tx" edges (wallets that funded this tx, i.e. its
    inputs), fan_out = "tx_addr" edges (wallets this tx paid, i.e. its outputs) — this is
    literally the transaction's input/output count.
    """
    fan_in = fan_out = 0
    for neighbor in graph.neighbors(node_id):
        edge_type = graph.edges[node_id, neighbor].get("edge_type")
        if edge_type == "tx_addr":
            # tx_addr edges point tx -> wallet; from either endpoint's perspective this is
            # "money arriving at the wallet end" of the edge.
            if graph.nodes[node_id].get("node_type") == "wallet":
                fan_in += 1
            else:
                fan_out += 1
        elif edge_type == "addr_tx":
            # addr_tx edges point wallet -> tx; "money leaving the wallet end".
            if graph.nodes[node_id].get("node_type") == "wallet":
                fan_out += 1
            else:
                fan_in += 1
        # tx_tx edges (money flow between two transactions) aren't directional in the
        # undirected graph object as stored, so they don't contribute to fan-in/fan-out
        # here — hop_depth (below) is where tx-tx structure is used instead.
    return fan_in, fan_out


def _fan_ratio(fan_in: int, fan_out: int) -> float | None:
    total = fan_in + fan_out
    if total == 0:
        return None
    return (fan_in - fan_out) / total


def build_address_timestamp_index(
    tx_df: pd.DataFrame, node_ids: set[str] | None = None
) -> dict[str, list[pd.Timestamp]]:
    """node_id (wallet_<address> / tx_<txid>) -> sorted list of real timestamps it's
    associated with in unified_dataset.csv.

    Args:
        node_ids: when given, only builds entries for these specific node ids — the
            common case, since classify_intents() only ever needs timing history for the
            already-flagged alert entities (tens of rows), not all ~1M addresses/
            transactions in the full dataset. This is a real, measured fix: an earlier
            version of this function unconditionally exploded every row's
            input_addresses/output_addresses via a Python-level ast.literal_eval loop over
            the whole unified_dataset.csv regardless of how many entities were actually
            being classified — profiled at 925s on the real full dataset for a 10-alert
            batch. Scoping the scan to just the needed node ids turns that into a couple
            of vectorized pandas filters (still a genuine read of the real data, just not
            wastefully processing 200k+ rows to answer ~50 questions).
            Pass None to index every address/txid in tx_df (used by tests and by any
            future caller that genuinely needs the full index).
    """
    index: dict[str, list] = {}

    if node_ids is not None:
        wallet_addrs = {nid[len("wallet_"):] for nid in node_ids if nid.startswith("wallet_")}
        tx_id_strs = {nid[len("tx_"):] for nid in node_ids if nid.startswith("tx_")}
    else:
        wallet_addrs = None  # full-scan mode below handles wallets via the explode path instead
        tx_id_strs = None

    # tx-type entities: each transaction's own timestamp is on its own row — a direct
    # vectorized filter on txid, no parsing needed regardless of dataset size.
    tx_rows = tx_df
    if tx_id_strs is not None:
        try:
            wanted_ids = {int(t) for t in tx_id_strs}
        except ValueError:
            wanted_ids = tx_id_strs
        tx_rows = tx_df[tx_df["txid"].astype(str).isin({str(t) for t in wanted_ids})]
    for row in tx_rows.itertuples(index=False):
        ts = getattr(row, "timestamp", None)
        if ts is not None:
            index.setdefault(f"tx_{row.txid}", []).append(ts)

    # wallet-type entities: vectorized substring search per address (quoted, to match a
    # full list element rather than risk a false-positive substring of a longer address)
    # instead of parsing every row's address lists in Python.
    if node_ids is not None:
        for addr in wallet_addrs:
            needle = f"'{addr}'"
            mask = (
                tx_df["input_addresses"].astype(str).str.contains(needle, regex=False)
                | tx_df["output_addresses"].astype(str).str.contains(needle, regex=False)
            )
            matches = tx_df.loc[mask, "timestamp"]
            if len(matches):
                index.setdefault(f"wallet_{addr}", []).extend(matches.tolist())
    else:
        import ast

        def _addr_list(value: object) -> list[str]:
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

        for row in tx_df.itertuples(index=False):
            ts = getattr(row, "timestamp", None)
            if ts is None:
                continue
            for col in ("input_addresses", "output_addresses"):
                for addr in _addr_list(getattr(row, col, None)):
                    if addr:
                        index.setdefault(f"wallet_{addr}", []).append(ts)

    for node_id, timestamps in index.items():
        index[node_id] = sorted(pd.to_datetime(timestamps))
    return index


def _timing_signals(node_id: str, timestamp_index: dict[str, list[pd.Timestamp]]) -> dict:
    timestamps = timestamp_index.get(node_id, [])
    n = len(timestamps)

    if n < MIN_EVENTS_FOR_TIMING_SIGNAL:
        return {
            "n_timed_events": n,
            "span_hours": None,
            "median_gap_hours": None,
            "events_per_hour": None,
            "timing_pattern": "insufficient",
        }

    span_hours = max((timestamps[-1] - timestamps[0]).total_seconds() / 3600.0, 1e-6)
    gaps_hours = [(timestamps[i + 1] - timestamps[i]).total_seconds() / 3600.0 for i in range(n - 1)]
    median_gap = sorted(gaps_hours)[len(gaps_hours) // 2]
    density = n / span_hours

    # Named, not tuned: a burst is many events packed into <=48h; patient gaps means the
    # typical wait between moves is >=2 weeks (336h, chosen because it matches Elliptic's
    # own ~2-week time-step window, not because it's an empirically correct real-world
    # cutoff); anything else in between reads as a sustained, steady spread. Eyeballed
    # against the archetypes' qualitative shape, not validated against labeled cases — see
    # the module docstring's "CALIBRATION STATUS" section.
    burst_window_hours = 48.0
    patient_gap_hours = 336.0

    if span_hours <= burst_window_hours and n >= 3:
        pattern = "burst"
    elif median_gap >= patient_gap_hours:
        pattern = "patient_gaps"
    else:
        pattern = "spread"

    return {
        "n_timed_events": n,
        "span_hours": round(span_hours, 2),
        "median_gap_hours": round(median_gap, 2),
        "events_per_hour": round(density, 4),
        "timing_pattern": pattern,
    }


def compute_hop_depth_map(graph: nx.Graph) -> dict[str, int]:
    """Multi-source BFS distance (undirected, unweighted) from the graph's earliest
    time_step tx nodes to every other node — one O(V+E) pass over the whole graph,
    reusing the graph_ml graph object exactly as built, no rebuild.

    "Earliest time_step" is used as the origin set because it's a genuine temporal signal
    already on every tx node (loaded straight from Elliptic, not derived here) — the
    nodes active in the graph's first observed time window are the closest thing this
    dataset has to "the start of the trace."
    """
    time_steps = [
        d["time_step"]
        for _, d in graph.nodes(data=True)
        if d.get("node_type") == "tx" and d.get("time_step") is not None
    ]
    if not time_steps:
        return {}
    earliest = min(time_steps)
    origins = [
        n
        for n, d in graph.nodes(data=True)
        if d.get("node_type") == "tx" and d.get("time_step") == earliest
    ]

    depth: dict[str, int] = {n: 0 for n in origins}
    queue = deque(origins)
    while queue:
        current = queue.popleft()
        for neighbor in graph.neighbors(current):
            if neighbor not in depth:
                depth[neighbor] = depth[current] + 1
                queue.append(neighbor)
    return depth


def _percentile_rank(value: float | None, population: list[float]) -> float | None:
    if value is None or not population:
        return None
    below_or_equal = sum(1 for v in population if v <= value)
    return round(100.0 * below_or_equal / len(population), 1)


# ---------------------------------------------------------------------------
# Archetype signatures. Each is a named, documented rule — not a learned decision
# boundary — built from the general, publicly-documented pattern each crime type is known
# to move money in. Cite-able reasoning lives in each docstring so this can be defended if
# someone asks "where did this rule come from."
# ---------------------------------------------------------------------------


def _score_ransomware(s: EntitySignals) -> tuple[float, list[str]]:
    """Ransomware-shaped: many victims pay small ransoms independently into one wallet
    within a short window after an attack (fan-in heavy, burst timing), then the operator
    typically consolidates/moves the funds on relatively quickly rather than sitting on
    them — this is the widely-documented "collection wallet" pattern reported in
    ransomware payment-tracking research (e.g. Chainalysis/Elliptic public writeups on
    ransomware wallet clustering): many-to-one convergence, then rapid onward movement.
    """
    criteria = []
    score = 0.0

    if s.fan_ratio is not None and s.fan_ratio >= 0.5:
        score += 0.45
        criteria.append(f"fan-in heavy (fan_ratio={s.fan_ratio:.2f}, many payers converging)")
    if s.timing_pattern == "burst":
        score += 0.35
        criteria.append(f"burst timing window ({s.span_hours}h span, {s.n_timed_events} events)")
    # Rapid onward movement reads as shallow-to-moderate hop depth (an early consolidation
    # point, not a deeply layered one) — a weaker, secondary signal, not a hard gate.
    if s.hop_depth_percentile is not None and s.hop_depth_percentile <= HOP_DEPTH_SHALLOW_MAX_PERCENTILE:
        score += 0.20
        criteria.append(f"shallow-to-moderate hop depth (percentile {s.hop_depth_percentile})")

    return score, criteria


def _score_darknet_market(s: EntitySignals) -> tuple[float, list[str]]:
    """Darknet-market-shaped: an escrow-based marketplace wallet sees steady many-to-many
    traffic over a sustained period (many buyers in, many vendors/withdrawals out — not a
    one-sided funnel), and escrow hold-then-release mechanics show up as pause-then-burst
    gap patterns rather than either a single tight burst or perfectly uniform spacing —
    consistent with published darknet-market fund-flow studies (e.g. academic tracing of
    Silk-Road-style escrow wallets) describing sustained, bidirectional activity rather
    than a single collection event.
    """
    criteria = []
    score = 0.0

    if s.fan_ratio is not None and abs(s.fan_ratio) <= 0.3:
        score += 0.4
        criteria.append(f"balanced many-to-many flow (fan_ratio={s.fan_ratio:.2f})")
    if s.timing_pattern in ("spread", "patient_gaps") and s.n_timed_events >= 3:
        score += 0.35
        criteria.append(f"sustained activity over time ({s.n_timed_events} events, {s.span_hours}h span)")
    if (
        s.hop_depth_percentile is not None
        and HOP_DEPTH_MODERATE_MIN_PERCENTILE <= s.hop_depth_percentile <= HOP_DEPTH_MODERATE_MAX_PERCENTILE
    ):
        score += 0.25
        criteria.append(f"moderate hop depth (percentile {s.hop_depth_percentile}, neither source nor deeply layered)")

    return score, criteria


def _score_sanctions_evasion(s: EntitySignals) -> tuple[float, list[str]]:
    """Sanctions-evasion-shaped: deliberately infrequent, high-value, heavily-layered
    movement — the entity moves money rarely, in large individual amounts when it does,
    with long deliberate gaps and passed through many hops to obscure the trail before
    reaching its destination. This mirrors publicly documented OFAC/Treasury designations
    of sanctioned-entity wallets, which show low transaction counts, large individual
    transfers, and multi-hop layering rather than high-frequency small-value traffic.
    """
    criteria = []
    score = 0.0

    if s.n_timed_events > 0 and s.n_timed_events <= 3:
        score += 0.25
        criteria.append(f"low transaction frequency ({s.n_timed_events} timed events)")
    if s.timing_pattern == "patient_gaps":
        score += 0.25
        criteria.append(f"long deliberate gaps (median gap {s.median_gap_hours}h)")
    if s.hop_depth_percentile is not None and s.hop_depth_percentile >= HOP_DEPTH_DEEP_MIN_PERCENTILE:
        score += 0.30
        criteria.append(f"deliberately high hop-chain depth (percentile {s.hop_depth_percentile})")
    if s.wallet_amount_percentile is not None and s.wallet_amount_percentile >= WALLET_AMOUNT_HIGH_MIN_PERCENTILE:
        score += 0.20
        criteria.append(f"high individual amounts (wallet BTC-transacted percentile {s.wallet_amount_percentile})")
    # wallet_amount_percentile is None for tx-type entities (Elliptic's tx features are
    # anonymized, no interpretable amount field) — that sub-signal is simply unavailable
    # for those rows rather than penalized, per the "where amount data is available" caveat.

    return score, criteria


ARCHETYPE_SCORERS = {
    "Ransomware-shaped": _score_ransomware,
    "Darknet-market-shaped": _score_darknet_market,
    "Sanctions-evasion-shaped": _score_sanctions_evasion,
}


def match_archetype(s: EntitySignals) -> ArchetypeMatch:
    """Score an entity's signals against every archetype signature and return the best
    match — or an honest fallback if nothing clears the confidence bar.

    Two distinct fallback labels, not one generic catch-all:
    - "Insufficient signal": the underlying measurements themselves are too thin to
      evaluate (no fan-in/out edges, no usable timing, unreachable hop depth) — we
      genuinely don't have enough to say anything.
    - "Pattern unclear": we do have real signal on all three dimensions, it just doesn't
      clearly fit any of the three defined archetypes.
    """
    has_fan_signal = s.fan_ratio is not None
    has_timing_signal = s.timing_pattern != "insufficient"
    has_hop_signal = s.hop_depth is not None

    if not (has_fan_signal or has_timing_signal or has_hop_signal):
        return ArchetypeMatch(
            label="Insufficient signal",
            confidence=0.0,
            explanation="No usable fan-in/out, timing, or hop-depth signal for this entity.",
        )

    best_label, best_score, best_criteria = None, 0.0, []
    for label, scorer in ARCHETYPE_SCORERS.items():
        score, criteria = scorer(s)
        if score > best_score:
            best_label, best_score, best_criteria = label, score, criteria

    if best_label is None or best_score < MIN_CONFIDENT_MATCH_SCORE:
        return ArchetypeMatch(
            label="Pattern unclear",
            confidence=round(best_score, 3),
            explanation=(
                f"Closest candidate was '{best_label}' at {best_score:.2f} confidence, "
                f"below the {MIN_CONFIDENT_MATCH_SCORE} bar for a confident match — signals "
                "don't clearly fit any defined archetype."
                if best_label
                else "No archetype scored above zero for this entity."
            ),
        )

    return ArchetypeMatch(
        label=best_label,
        confidence=round(best_score, 3),
        explanation="; ".join(best_criteria),
        matched_criteria=best_criteria,
    )


# ---------------------------------------------------------------------------
# Public entry point
# ---------------------------------------------------------------------------


def classify_intents(
    graph: nx.Graph,
    alerts_df: pd.DataFrame,
    tx_df: pd.DataFrame | None = None,
) -> pd.DataFrame:
    """Add intent_label/intent_confidence/intent_explanation columns to an already-built
    ranked alerts DataFrame. Pure post-processing — never touches classifier/anomaly/
    clustering results, and returns a new DataFrame rather than mutating the input.

    Args:
        graph: the already-built graph_ml graph (from graph_builder), used for fan-in/out
            and hop-depth — not rebuilt here.
        alerts_df: the DataFrame build_ranked_alerts() already produced.
        tx_df: Person A's unified_dataset.csv, if available, for real-timestamp timing
            signal. Pass None to run without it — timing falls back to "insufficient
            signal" honestly rather than faking a substitute.
    """
    import time as _time

    _t0 = _time.time()
    needed_node_ids = set(alerts_df["node_id"])
    timestamp_index = (
        build_address_timestamp_index(tx_df, node_ids=needed_node_ids) if tx_df is not None else {}
    )
    logger.info("build_address_timestamp_index: %.2fs (%d entities indexed)", _time.time() - _t0, len(timestamp_index))

    _t0 = _time.time()
    hop_depth_map = compute_hop_depth_map(graph)
    logger.info("compute_hop_depth_map: %.2fs (%d nodes reached)", _time.time() - _t0, len(hop_depth_map))

    hop_depth_population = [hop_depth_map[nid] for nid in alerts_df["node_id"] if nid in hop_depth_map]
    wallet_amount_population = [
        graph.nodes[nid].get("wallet_btc_transacted_mean")
        for nid in alerts_df["node_id"]
        if nid in graph.nodes and graph.nodes[nid].get("node_type") == "wallet"
        and graph.nodes[nid].get("wallet_btc_transacted_mean") is not None
    ]

    labels, confidences, explanations = [], [], []
    fan_ins, fan_outs, fan_ratios = [], [], []
    hop_depths, timing_patterns, n_events_list = [], [], []

    for node_id in alerts_df["node_id"]:
        if node_id not in graph.nodes:
            labels.append("Insufficient signal")
            confidences.append(0.0)
            explanations.append("Node not found in graph (subsampled run).")
            fan_ins.append(None)
            fan_outs.append(None)
            fan_ratios.append(None)
            hop_depths.append(None)
            timing_patterns.append("insufficient")
            n_events_list.append(0)
            continue

        node_attrs = graph.nodes[node_id]
        node_type = node_attrs.get("node_type", "unknown")

        fan_in, fan_out = _fan_in_out(graph, node_id)
        fan_ratio = _fan_ratio(fan_in, fan_out)
        timing = _timing_signals(node_id, timestamp_index)
        hop_depth = hop_depth_map.get(node_id)

        wallet_amount = node_attrs.get("wallet_btc_transacted_mean") if node_type == "wallet" else None

        signals = EntitySignals(
            node_id=node_id,
            node_type=node_type,
            fan_in=fan_in,
            fan_out=fan_out,
            fan_ratio=fan_ratio,
            n_timed_events=timing["n_timed_events"],
            span_hours=timing["span_hours"],
            median_gap_hours=timing["median_gap_hours"],
            events_per_hour=timing["events_per_hour"],
            timing_pattern=timing["timing_pattern"],
            hop_depth=hop_depth,
            wallet_avg_btc_amount=wallet_amount,
            hop_depth_percentile=_percentile_rank(hop_depth, hop_depth_population),
            wallet_amount_percentile=_percentile_rank(wallet_amount, wallet_amount_population),
        )

        match = match_archetype(signals)

        labels.append(match.label)
        confidences.append(match.confidence)
        explanations.append(match.explanation)
        fan_ins.append(fan_in)
        fan_outs.append(fan_out)
        fan_ratios.append(round(fan_ratio, 3) if fan_ratio is not None else None)
        hop_depths.append(hop_depth)
        timing_patterns.append(timing["timing_pattern"])
        n_events_list.append(timing["n_timed_events"])

    result = alerts_df.copy()
    result["intent_label"] = labels
    result["intent_confidence"] = confidences
    result["intent_explanation"] = explanations
    # Raw signal values kept alongside the label so the numbers behind each match are
    # inspectable, not just the final label — same explainability spirit as the existing
    # "reason" column.
    result["intent_fan_in"] = fan_ins
    result["intent_fan_out"] = fan_outs
    result["intent_fan_ratio"] = fan_ratios
    result["intent_hop_depth"] = hop_depths
    result["intent_timing_pattern"] = timing_patterns
    result["intent_n_timed_events"] = n_events_list
    return result
