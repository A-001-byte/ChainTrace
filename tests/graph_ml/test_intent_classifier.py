"""Tests for src/graph_ml/intent_classifier.py — the rule-based intent archetype matcher.

Uses small synthetic graphs/DataFrames (not the real ~1M-node dataset) so tests run fast;
the real-data numbers are verified separately and reported to the user directly, not
re-asserted here as brittle golden values.
"""

from __future__ import annotations

import networkx as nx
import pandas as pd
import pytest

from src.graph_ml import intent_classifier as ic


def _make_wallet_node(graph, node_id, node_type="wallet", label="illicit", cluster=0, **extra):
    graph.add_node(node_id, node_type=node_type, label=label, cluster=cluster, **extra)


class TestFanInOut:
    def test_wallet_with_many_incoming_tx_addr_edges_is_fan_in_heavy(self):
        g = nx.Graph()
        _make_wallet_node(g, "wallet_A")
        for i in range(5):
            g.add_node(f"tx_{i}", node_type="tx", time_step=1)
            g.add_edge("tx_{}".format(i), "wallet_A", edge_type="tx_addr")

        fan_in, fan_out = ic._fan_in_out(g, "wallet_A")
        assert fan_in == 5
        assert fan_out == 0
        assert ic._fan_ratio(fan_in, fan_out) == 1.0

    def test_wallet_with_many_outgoing_addr_tx_edges_is_fan_out_heavy(self):
        g = nx.Graph()
        _make_wallet_node(g, "wallet_B")
        for i in range(4):
            g.add_node(f"tx_{i}", node_type="tx", time_step=1)
            g.add_edge("wallet_B", f"tx_{i}", edge_type="addr_tx")

        fan_in, fan_out = ic._fan_in_out(g, "wallet_B")
        assert fan_in == 0
        assert fan_out == 4
        assert ic._fan_ratio(fan_in, fan_out) == -1.0

    def test_balanced_wallet_has_fan_ratio_near_zero(self):
        g = nx.Graph()
        _make_wallet_node(g, "wallet_C")
        for i in range(3):
            g.add_node(f"tx_in_{i}", node_type="tx", time_step=1)
            g.add_edge(f"tx_in_{i}", "wallet_C", edge_type="tx_addr")
        for i in range(3):
            g.add_node(f"tx_out_{i}", node_type="tx", time_step=1)
            g.add_edge("wallet_C", f"tx_out_{i}", edge_type="addr_tx")

        fan_in, fan_out = ic._fan_in_out(g, "wallet_C")
        assert fan_in == 3
        assert fan_out == 3
        assert ic._fan_ratio(fan_in, fan_out) == 0.0

    def test_isolated_node_has_undefined_fan_ratio(self):
        g = nx.Graph()
        _make_wallet_node(g, "wallet_lonely")
        fan_in, fan_out = ic._fan_in_out(g, "wallet_lonely")
        assert ic._fan_ratio(fan_in, fan_out) is None


class TestTimestampIndex:
    def _sample_tx_df(self):
        return pd.DataFrame(
            [
                {
                    "txid": 100,
                    "timestamp": "2015-01-01 00:00:00",
                    "input_addresses": "['addrA']",
                    "output_addresses": "['addrB']",
                },
                {
                    "txid": 101,
                    "timestamp": "2015-01-01 01:00:00",
                    "input_addresses": "['addrA']",
                    "output_addresses": "['addrC']",
                },
                {
                    "txid": 200,
                    "timestamp": "2015-06-01 00:00:00",
                    "input_addresses": "['addrZ']",
                    "output_addresses": "[]",
                },
            ]
        )

    def test_scoped_index_only_builds_requested_node_ids(self):
        tx_df = self._sample_tx_df()
        index = ic.build_address_timestamp_index(tx_df, node_ids={"wallet_addrA", "tx_100"})

        assert set(index.keys()) == {"wallet_addrA", "tx_100"}
        assert len(index["wallet_addrA"]) == 2  # appears in txid 100 and 101
        assert len(index["tx_100"]) == 1

    def test_scoped_index_ignores_unrequested_addresses_even_if_present(self):
        tx_df = self._sample_tx_df()
        index = ic.build_address_timestamp_index(tx_df, node_ids={"wallet_addrA"})
        assert "wallet_addrZ" not in index
        assert "wallet_addrC" not in index  # addrC only appears as an output, not requested

    def test_full_scan_mode_indexes_every_address_when_node_ids_is_none(self):
        tx_df = self._sample_tx_df()
        index = ic.build_address_timestamp_index(tx_df, node_ids=None)
        for expected in ("wallet_addrA", "wallet_addrB", "wallet_addrC", "wallet_addrZ", "tx_100", "tx_101", "tx_200"):
            assert expected in index

    def test_quoted_substring_match_avoids_prefix_false_positive(self):
        # "addrA" must not match a row that only contains "addrAB" (a different, longer
        # address that happens to start with the same characters).
        tx_df = pd.DataFrame(
            [
                {
                    "txid": 1,
                    "timestamp": "2015-01-01 00:00:00",
                    "input_addresses": "['addrAB']",
                    "output_addresses": "[]",
                }
            ]
        )
        index = ic.build_address_timestamp_index(tx_df, node_ids={"wallet_addrA"})
        assert index.get("wallet_addrA", []) == []


class TestTimingSignals:
    def test_two_events_far_apart_with_short_gaps_reads_as_burst(self):
        ts = pd.to_datetime(["2015-01-01 00:00:00", "2015-01-01 02:00:00", "2015-01-01 04:00:00"])
        signals = ic._timing_signals("wallet_x", {"wallet_x": sorted(ts)})
        assert signals["timing_pattern"] == "burst"
        assert signals["n_timed_events"] == 3

    def test_long_median_gap_reads_as_patient_gaps(self):
        ts = pd.to_datetime(["2015-01-01", "2015-02-01", "2015-03-15"])
        signals = ic._timing_signals("wallet_y", {"wallet_y": sorted(ts)})
        assert signals["timing_pattern"] == "patient_gaps"

    def test_single_event_is_insufficient_signal(self):
        signals = ic._timing_signals("wallet_z", {"wallet_z": pd.to_datetime(["2015-01-01"])})
        assert signals["timing_pattern"] == "insufficient"
        assert signals["n_timed_events"] == 1

    def test_missing_node_is_insufficient_signal(self):
        signals = ic._timing_signals("wallet_absent", {})
        assert signals["timing_pattern"] == "insufficient"


class TestHopDepthMap:
    def test_origin_nodes_get_depth_zero_and_depth_increases_with_distance(self):
        g = nx.Graph()
        g.add_node("tx_origin", node_type="tx", time_step=1)
        g.add_node("tx_hop1", node_type="tx", time_step=2)
        g.add_node("wallet_hop2", node_type="wallet", label="illicit", cluster=0)
        g.add_edge("tx_origin", "tx_hop1", edge_type="tx_tx")
        g.add_edge("tx_hop1", "wallet_hop2", edge_type="tx_addr")

        depth_map = ic.compute_hop_depth_map(g)

        assert depth_map["tx_origin"] == 0
        assert depth_map["tx_hop1"] == 1
        assert depth_map["wallet_hop2"] == 2

    def test_disconnected_node_is_unreachable(self):
        g = nx.Graph()
        g.add_node("tx_origin", node_type="tx", time_step=1)
        g.add_node("wallet_isolated", node_type="wallet", label="illicit", cluster=0)
        depth_map = ic.compute_hop_depth_map(g)
        assert "wallet_isolated" not in depth_map

    def test_empty_graph_returns_empty_map(self):
        assert ic.compute_hop_depth_map(nx.Graph()) == {}


class TestMatchArchetype:
    def _signals(self, **overrides):
        defaults = dict(
            node_id="wallet_test",
            node_type="wallet",
            fan_in=0,
            fan_out=0,
            fan_ratio=None,
            n_timed_events=0,
            span_hours=None,
            median_gap_hours=None,
            events_per_hour=None,
            timing_pattern="insufficient",
            hop_depth=None,
            wallet_avg_btc_amount=None,
            hop_depth_percentile=None,
            wallet_amount_percentile=None,
        )
        defaults.update(overrides)
        return ic.EntitySignals(**defaults)

    def test_ransomware_shaped_signature_matches(self):
        s = self._signals(
            fan_ratio=0.9,
            timing_pattern="burst",
            n_timed_events=5,
            span_hours=10,
            hop_depth=2,
            hop_depth_percentile=20,
        )
        match = ic.match_archetype(s)
        assert match.label == "Ransomware-shaped"
        assert match.confidence >= ic.MIN_CONFIDENT_MATCH_SCORE

    def test_darknet_market_shaped_signature_matches(self):
        s = self._signals(
            fan_ratio=0.05,
            timing_pattern="spread",
            n_timed_events=10,
            span_hours=2000,
            hop_depth=5,
            hop_depth_percentile=50,
        )
        match = ic.match_archetype(s)
        assert match.label == "Darknet-market-shaped"

    def test_sanctions_evasion_shaped_signature_matches(self):
        s = self._signals(
            fan_ratio=0.0,
            n_timed_events=2,
            timing_pattern="patient_gaps",
            median_gap_hours=1000,
            hop_depth=9,
            hop_depth_percentile=90,
            wallet_avg_btc_amount=50.0,
            wallet_amount_percentile=95,
        )
        match = ic.match_archetype(s)
        assert match.label == "Sanctions-evasion-shaped"

    def test_weak_mixed_signal_falls_back_to_pattern_unclear(self):
        # fan_ratio=0.4 is too high to count as darknet's "balanced" (<=0.3) and too low
        # for ransomware's "fan-in heavy" (>=0.5); only 2 timed events is below every
        # archetype's timing-frequency bar; hop_depth sits in the middle, satisfying only
        # the weakest single criterion (darknet's "moderate hop depth", worth 0.25) —
        # every archetype should land well under the 0.6 confidence bar.
        s = self._signals(
            fan_ratio=0.4,
            timing_pattern="spread",
            n_timed_events=2,
            hop_depth=3,
            hop_depth_percentile=50,
        )
        match = ic.match_archetype(s)
        assert match.label == "Pattern unclear"
        assert match.confidence < ic.MIN_CONFIDENT_MATCH_SCORE

    def test_completely_empty_signal_is_insufficient_not_pattern_unclear(self):
        s = self._signals()  # every field left at its "no signal" default
        match = ic.match_archetype(s)
        assert match.label == "Insufficient signal"

    def test_explanation_cites_the_actual_matched_criteria(self):
        s = self._signals(
            fan_ratio=0.9,
            timing_pattern="burst",
            n_timed_events=5,
            span_hours=10,
            hop_depth=2,
            hop_depth_percentile=20,
        )
        match = ic.match_archetype(s)
        assert "fan-in" in match.explanation.lower()
        assert len(match.matched_criteria) > 0


class TestClassifyIntentsIntegration:
    def test_adds_expected_columns_without_mutating_input(self):
        g = nx.Graph()
        g.add_node("tx_origin", node_type="tx", time_step=1)
        g.add_node("wallet_A", node_type="wallet", label="illicit", cluster=0)
        for i in range(4):
            g.add_node(f"tx_pay_{i}", node_type="tx", time_step=2)
            g.add_edge(f"tx_pay_{i}", "wallet_A", edge_type="tx_addr")
            g.add_edge("tx_origin", f"tx_pay_{i}", edge_type="tx_tx")

        alerts_df = pd.DataFrame(
            [{"node_id": "wallet_A", "node_type": "wallet", "risk_score": 0.9, "reason": "x"}]
        )
        original_columns = list(alerts_df.columns)

        result = ic.classify_intents(g, alerts_df, tx_df=None)

        assert original_columns == list(alerts_df.columns)  # input untouched
        for col in ("intent_label", "intent_confidence", "intent_explanation", "intent_fan_in", "intent_fan_out"):
            assert col in result.columns
        assert result.loc[0, "intent_fan_in"] == 4
        assert result.loc[0, "intent_fan_out"] == 0

    def test_node_not_in_graph_gets_insufficient_signal_not_a_crash(self):
        g = nx.Graph()
        g.add_node("tx_origin", node_type="tx", time_step=1)
        alerts_df = pd.DataFrame([{"node_id": "wallet_ghost", "node_type": "wallet", "risk_score": 0.5}])

        result = ic.classify_intents(g, alerts_df, tx_df=None)
        assert result.loc[0, "intent_label"] == "Insufficient signal"

    def test_runs_without_tx_df_and_reports_insufficient_timing_honestly(self):
        g = nx.Graph()
        g.add_node("tx_origin", node_type="tx", time_step=1)
        g.add_node("wallet_A", node_type="wallet", label="illicit", cluster=0)
        g.add_edge("tx_origin", "wallet_A", edge_type="tx_addr")
        alerts_df = pd.DataFrame([{"node_id": "wallet_A", "node_type": "wallet", "risk_score": 0.9}])

        result = ic.classify_intents(g, alerts_df, tx_df=None)
        assert result.loc[0, "intent_timing_pattern"] == "insufficient"
