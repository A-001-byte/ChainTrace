"""ChainTrace Dashboard Module Entry Point."""

from __future__ import annotations

import os
import sys

# Ensure root directory is on Python path
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "../..")))

from app import main

if __name__ == "__main__":
    main()
