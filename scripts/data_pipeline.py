"""CLI entry point for Person A's Phase 1 data pipeline.

Real logic lives in src/data_pipeline/ (mirrors Person B's src/graph_ml/ package
structure) so it's importable/testable rather than a one-off script. Run from repo root:

    python scripts/data_pipeline.py
"""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from src.data_pipeline.pipeline import main

if __name__ == "__main__":
    main()
