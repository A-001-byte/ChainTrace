"""Adversarial Provenance Layer (APL) — additive analysis module.

Consumes already-verified inputs as a stable API:
  - data/raw/elliptic_pp/*.csv          (real Elliptic++ address-transaction structure)
  - outputs/alerts/ranked_alerts.csv    (Contract B output of the graph_ml pipeline)

It does NOT import from, modify, or duplicate logic in src/data_pipeline/ or
src/graph_ml/. Those are treated as upstream systems this module reads the outputs of.
"""
