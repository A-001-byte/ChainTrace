# ChainTrace

Offline forensic system that fuses Bitcoin's network layer (IP/port/timing) with its blockchain
layer (wallets/TXIDs/amounts) into one entity-transaction graph, then uses ML to surface ranked,
explainable investigative leads — built for SIH26146 (NTRO).

See `ChainTrace_Project_Blueprint.md` (project context) and `ChainTrace_Prototype_Plan.md`
(phase-by-phase build plan) for full background.

## Repo layout

```
data/
  raw/
    elliptic/       # Elliptic dataset CSVs: txs_features.csv, txs_classes.csv, txs_edgelist.csv
    elliptic_pp/     # Elliptic++ CSVs: wallets_features.csv, wallets_classes.csv,
                     #   AddrTx_edgelist.csv, TxAddr_edgelist.csv
    geolite2/        # GeoLite2-City / GeoLite2-ASN CSVs or .mmdb files
  processed/         # Unified merged dataset output by the data pipeline (Phase 1)

src/
  data_pipeline/     # Person A — ingestion, synthetic IP/port/timestamp gen, GeoIP enrichment
  graph_ml/          # Person B — graph construction, Louvain, RandomForest, IsolationForest,
                      #   explainability, ranked risk scoring
  dashboard/          # Person C — Streamlit app, stats, alert table
  visualization/      # Person D — pyvis graph rendering, dashboard integration

notebooks/            # scratch/exploration notebooks
outputs/
  models/             # trained model artifacts (.pkl/.joblib) — gitignored
  alerts/             # ranked alert CSV output — gitignored
  graphs/             # exported pyvis HTML graphs — gitignored
```

## Setup

```bash
python -m venv .venv
# Windows:
.venv\Scripts\activate
# macOS/Linux:
source .venv/bin/activate

pip install -r requirements.txt
```

Drop raw datasets into `data/raw/` per the structure above (gitignored — not committed).
Copy `.env.example` to `.env` and fill in your GeoLite2 license key.

## Data sources

- Elliptic Data Set (Kaggle): https://www.kaggle.com/datasets/ellipticco/elliptic-data-set
- Elliptic++ Dataset (GitHub): https://github.com/git-disl/EllipticPlusPlus
- MaxMind GeoLite2: https://www.maxmind.com/en/geolite2/signup
