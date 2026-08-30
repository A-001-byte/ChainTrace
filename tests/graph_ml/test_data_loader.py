"""Tests for the Elliptic++ wallet loader against a schema that mirrors the *real*
downloaded files exactly — spaces in column names, input_address/output_address edge
columns, and int class labels 1/2/3 — since those are the things that broke on first
wiring against real data (see risk_scoring/data_loader history).
"""

import pandas as pd
import pytest

from src.graph_ml import config, data_loader


@pytest.fixture
def elliptic_pp_layout(tmp_path, monkeypatch):
    """Write tiny CSVs matching the real Elliptic++ schema into a temp dir and point
    config at them, so load_elliptic_pp_wallets() runs against realistic files.
    """
    pp_dir = tmp_path / "elliptic_pp"
    pp_dir.mkdir()

    wallets_features = pd.DataFrame(
        {
            "address": ["addrA", "addrB", "addrC"],
            "Time step": [1, 2, 3],
            "num_txs_as_sender": [1, 2, 3],
            "num_txs_as receiver": [4, 5, 6],  # real file has a space here, not an underscore
        }
    )
    wallets_classes = pd.DataFrame({"address": ["addrA", "addrB", "addrC"], "class": [1, 2, 3]})
    addr_tx_edges = pd.DataFrame({"input_address": ["addrA", "addrB"], "txId": [100, 200]})
    tx_addr_edges = pd.DataFrame({"txId": [100, 300], "output_address": ["addrA", "addrC"]})

    wallets_features.to_csv(pp_dir / "wallets_features.csv", index=False)
    wallets_classes.to_csv(pp_dir / "wallets_classes.csv", index=False)
    addr_tx_edges.to_csv(pp_dir / "AddrTx_edgelist.csv", index=False)
    tx_addr_edges.to_csv(pp_dir / "TxAddr_edgelist.csv", index=False)

    monkeypatch.setattr(config, "ELLIPTIC_PP_DIR", pp_dir)
    monkeypatch.setattr(config, "WALLETS_FEATURES_CSV", pp_dir / "wallets_features.csv")
    monkeypatch.setattr(config, "WALLETS_CLASSES_CSV", pp_dir / "wallets_classes.csv")
    monkeypatch.setattr(config, "ADDR_TX_EDGELIST_CSV", pp_dir / "AddrTx_edgelist.csv")
    monkeypatch.setattr(config, "TX_ADDR_EDGELIST_CSV", pp_dir / "TxAddr_edgelist.csv")
    return pp_dir


def test_sanitize_column_name_strips_spaces_and_keeps_it_a_valid_identifier():
    assert data_loader._sanitize_column_name("num_txs_as receiver") == "num_txs_as_receiver"
    assert data_loader._sanitize_column_name("Time step") == "Time_step"
    assert data_loader._sanitize_column_name("already_clean") == "already_clean"


def test_elliptic_pp_available_rejects_lfs_pointer_stubs(elliptic_pp_layout):
    # A real Git-LFS pointer file is ~130 bytes — verify the size-based stub detection works.
    (elliptic_pp_layout / "wallets_features.csv").write_text("version https://git-lfs.github.com/spec/v1\n")
    assert data_loader.elliptic_pp_available() is False


def test_load_elliptic_pp_wallets_normalizes_schema(elliptic_pp_layout, monkeypatch):
    # These fixture CSVs are a handful of rows (well under the real files' hundreds-of-MB
    # size), so bypass the LFS-pointer-stub size heuristic — that heuristic has its own
    # dedicated test above.
    monkeypatch.setattr(data_loader, "elliptic_pp_available", lambda: True)
    wallets, addr_tx_edges, tx_addr_edges = data_loader.load_elliptic_pp_wallets()

    # class 1/2/3 -> illicit/licit/unknown, "Time step" -> time_step, space in feature name sanitized
    assert set(wallets["class"]) == {"illicit", "licit", "unknown"}
    assert "time_step" in wallets.columns
    assert "num_txs_as_receiver" in wallets.columns

    # input_address / output_address both normalized to "address" so graph_builder can treat
    # both edgelists uniformly.
    assert list(addr_tx_edges.columns) == ["address", "txId"]
    assert list(tx_addr_edges.columns) == ["txId", "address"]


def test_load_elliptic_pp_wallets_keep_tx_ids_filters_wallets_and_edges(elliptic_pp_layout, monkeypatch):
    # Only txId 100 kept -> only addrA (linked to tx 100 both directions) should survive;
    # addrB (only linked to dropped tx 200) and addrC (only linked to dropped tx 300) should not.
    monkeypatch.setattr(data_loader, "elliptic_pp_available", lambda: True)
    wallets, addr_tx_edges, tx_addr_edges = data_loader.load_elliptic_pp_wallets(keep_tx_ids={100})

    assert set(wallets["address"]) == {"addrA"}
    assert set(addr_tx_edges["txId"]) == {100}
    assert set(tx_addr_edges["txId"]) == {100}
