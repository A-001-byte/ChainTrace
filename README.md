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
  graph_ml/          # Person B — graph construction, Louvain, RandomForest, IsolationForest,
                      #   explainability, ranked risk scoring
  dashboard/          # Person C — Streamlit app, stats, alert table
  visualization/      # Person D — pyvis graph rendering, dashboard integration
  webapp/             # Alternative HTML/CSS/JS frontend (Flask API + static page) reading
                       #   the same pipeline outputs as src/dashboard/ — a second, independent
                       #   view, not a replacement. See "Alternative web frontend" below.

scripts/
  data_pipeline.py    # Person A — ingestion, synthetic IP/port/timestamp gen, GeoIP enrichment
                      #   (currently a first draft — see open items below)

notebooks/            # scratch/exploration notebooks
outputs/
  models/             # trained model artifacts (.pkl/.joblib) — gitignored
  alerts/             # ranked alert CSV output — gitignored
  graphs/             # exported pyvis HTML graphs — gitignored
```

### Phase 1 — data pipeline status

`scripts/data_pipeline.py` (backed by `src/data_pipeline/`) is now Phase 1-complete against
the schema in `docs/ChainTrace_Project_Blueprint.md` Section 4d — verified against a full,
unsampled run of the real data (203,769 tx, 822,942 wallets): all 14 required columns present
(`dst_ip`/`dst_port`, `input_addresses[]`/`output_addresses[]`, amounts, `fee`, `script_type`
included), synthetic IPs are drawn from real GeoLite2-ASN CIDR blocks weighted toward
illicit-labeled transactions, GeoIP resolution is CSV-based (no `.mmdb` dependency), and it
reuses `src/graph_ml/data_loader.py::load_elliptic_pp_wallets()` for wallet loading rather than
duplicating it. Run it via `run_all.sh`/`run_all.bat` (see below) alongside the graph_ml
pipeline and dashboard, in one command.

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

## Running everything

`run_all.sh` (Linux/macOS/git-bash) / `run_all.bat` (Windows) run the data pipeline, then the
graph+ML pipeline, then launch the Streamlit dashboard, in one command — stopping with a clear
message if either pipeline fails rather than launching a broken dashboard:

```bash
./run_all.sh              # full dataset (slow but real, ~20-30 min)
./run_all.sh 5            # subsample to the first 5 time steps, for fast iteration
```

Once both pipeline outputs exist at their default paths (`data/processed/unified_dataset.csv`,
`outputs/alerts/ranked_alerts.csv`), the dashboard auto-loads them — no manual upload needed.

## Alternative web frontend

`src/webapp/` is a second, independent way to view the same pipeline outputs — plain
HTML/CSS/vanilla JS on a small Flask API, reusing (not duplicating) the schema validation in
`src/dashboard/data_loader.py` and the graph-building logic in
`src/dashboard/components/graph_container.py`. It doesn't replace or modify the Streamlit
dashboard; both can run side by side on different ports. Fully offline — the interactive graph
(pyvis) is served with its JS/CSS vendored locally under `src/webapp/static/vendor/` rather
than pyvis's own CDN references.

```bash
python -m src.webapp.server   # serves on http://127.0.0.1:5000
```

Endpoints: `GET /api/alerts`, `GET /api/stats`, `GET /api/graph`, `GET /api/geo`.

## Data sources

- Elliptic Data Set (Kaggle): https://www.kaggle.com/datasets/ellipticco/elliptic-data-set
- Elliptic++ Dataset (GitHub): https://github.com/git-disl/EllipticPlusPlus
- MaxMind GeoLite2: https://www.maxmind.com/en/geolite2/signup
