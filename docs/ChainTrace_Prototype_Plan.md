# ChainTrace — Prototype Build Plan (SIH26146)

**Window:** Today (30 Aug) → PPT/Video submission (1–4 Sept) | **Focus:** Bitcoin PS only, AMR is stretch-goal
**Squad:** 4 building prototype, 2 on PPT (rotate in for demo script/review)

---

## 1. Requirements Restatement

We need a **working, screen-recordable prototype** — not a deployed product — that proves:

1. We can ingest bulk Bitcoin transaction + network metadata
2. We can build a unified entity-transaction graph (wallets ↔ transactions ↔ IPs)
3. We run a real ML model (not hardcoded rules) to flag suspicious wallets/clusters
4. Each flag comes with a **confidence score + explainable reason**
5. All of this is visualized in a dashboard, and it runs **fully offline**

The deliverable for this round is a **demo video** showing the above running end-to-end, submitted alongside the PPT. It does not need to be publicly hosted or production-hardened — it needs to look real, run live on a laptop, and be explainable in ~3–4 minutes.

## 2. What We're Building

**A locally-run web dashboard app** (not a hosted website) — this is actually a feature, not a limitation: the PS explicitly demands an **offline** solution, so "runs entirely on a laptop with no internet dependency" is exactly on-brief.

- **Framework:** Streamlit (Python) — fastest path to a clean, functional dashboard without frontend framework overhead. Looks legitimate on camera, no deployment needed for a demo video.
- Runs locally via `streamlit run app.py`, opens in browser at `localhost:8501` — screen-record straight from there.

## 3. Resources & Tools Needed

| Resource | Purpose | Cost |
|---|---|---|
| GitHub repo (private, team access) | Version control, avoid Google Drive zip-file chaos | Free |
| Python 3.10+, pip/venv | Everyone's dev environment | Free |
| Google Colab (backup) | If anyone's laptop can't handle model training locally | Free |
| OBS Studio or Loom | Screen recording for demo video | Free |
| Any video editor (CapCut/DaVinci Resolve free tier) | Trim/caption the demo video | Free |
| Shared Notion/Google Doc | Track who's doing what, daily standup notes | Free |

No paid tools, no GPU required — everything below runs fine on a CPU.

## 4. Data — Sources, Links, Format

**The core challenge:** no public dataset has real Bitcoin transactions and real network-layer (IP/port) data together — that correlation is exactly what makes this PS hard, and exactly why NTRO is asking for it. So we use **real blockchain-layer data + our own synthetically generated network-layer data** — this is not a shortcut, it's literally what SIH's own PS text says the Grand Finale dataset will be (synthetic, modeled on real fields).

### 4a. Real blockchain-layer data (use as-is)

- **Elliptic Data Set (Kaggle)** — https://www.kaggle.com/datasets/ellipticco/elliptic-data-set
  Real Bitcoin transaction graph: 203,769 transactions (nodes), 234,355 edges, labeled illicit/licit/unknown, 166 features per node, spans 49 time steps.
- **Elliptic++ Dataset (GitHub)** — https://github.com/git-disl/EllipticPlusPlus
  Extends the above with wallet/actor-level data: 822,942 wallet address occurrences (530,840 unique in the raw source), each with 55 features, plus `AddrTx_edgelist.csv` / `TxAddr_edgelist.csv` linking wallets to transactions. **This is an input source, not a Contract A output.**

**Contract A output:** `data/processed/unified_dataset.csv` only. Its authoritative row count is the 203,769 Elliptic transaction nodes. Wallet-level CSVs, planted columns, and planted-wallet exports are not Contract A artifacts and must not be generated as parallel outputs.

### 4b. Synthetic network-layer data (we generate)

For each transaction/wallet node, generate:

- `timestamp` — derive from Elliptic's existing time-step field (spread realistically within each ~2-week window)
- `src_ip`, `dst_ip` — synthetic but realistic (mix of residential ISP ranges, VPN/hosting-provider ranges, and Tor-exit-like ranges for illicit-labeled nodes — this is what makes the "correlation" story credible)
- `src_port`, `dst_port` — Bitcoin's default P2P port (8333) for most, with some variation
- `geo_country` / `asn` — resolve your synthetic IPs through a real GeoIP database so the geo data is genuine even though the IP-to-transaction link is synthetic

### 4c. GeoIP enrichment (real, free)

- **MaxMind GeoLite2** — https://www.maxmind.com/en/geolite2/signup (free account + license key)
  Download GeoLite2-City and GeoLite2-ASN databases, use the `geoip2` Python package to resolve country/ASN for any IP.

### 4d. Target CSV schema (matches PS's stated minimum fields exactly)

| Column | Source | Notes |
|---|---|---|
| `timestamp` | Real (derived) | From Elliptic time-step |
| `src_ip`, `dst_ip` | Synthetic | Generated per node |
| `src_port`, `dst_port` | Synthetic | Mostly 8333 |
| `txid` | Real | From Elliptic `txs_features.csv` |
| `input_addresses[]`, `output_addresses[]` | Real | From Elliptic++ `AddrTx_edgelist.csv` / `TxAddr_edgelist.csv` |
| `input_amounts[]`, `output_amounts[]` | Real (partial) | Elliptic features are anonymized/scaled — use as proxy, flag clearly as normalized in the write-up |
| `fee`, `script_type` | Real/estimated | From Elliptic features where available |
| `geo_country`, `asn` | Real (via GeoLite2) | Resolved from synthetic IPs |

Document all of this explicitly in your write-up: **"real blockchain data, synthetic network layer, real GeoIP resolution"** — judges will respect the transparency far more than pretending it's all real.

## 5. Tech Stack

| Layer | Tool | Why |
|---|---|---|
| Data processing | Python, pandas | Standard, fast to write |
| Graph construction | NetworkX | Simple graph building, built-in community detection |
| ML — classification | scikit-learn (Random Forest) | Trains in minutes on Elliptic's labeled subset; Random Forest is actually the published strong baseline on this exact dataset — defensible choice, not a cop-out |
| ML — clustering | NetworkX `louvain_communities` (built-in ≥2.8) or `python-louvain` | Groups wallets into suspicious clusters |
| ML — anomaly detection | scikit-learn `IsolationForest` | Catches novel patterns the classifier wasn't trained on |
| Explainability | scikit-learn feature importances (or SHAP if time allows) | Powers the "why flagged" reasoning per alert |
| Dashboard | Streamlit | Fast, clean, runs locally |
| Graph visualization | pyvis (exports interactive HTML, embed via `streamlit.components.v1.html`) | Best looking-to-effort ratio for a link-analysis view |

**Stretch goal (only if Phase 1–3 finish early):** swap the Random Forest for a Graph Neural Network via PyTorch Geometric (`torch_geometric.datasets.EllipticBitcoinDataset` loads this exact dataset natively) — stronger "AI/ML" story, but not worth risking the deadline over.

## 6. Team Split (4 on prototype)

- **Person A — Data pipeline:** download/clean Elliptic + Elliptic++, build the synthetic IP/port/timestamp generator, GeoLite2 integration
- **Person B — Graph + ML:** build the NetworkX graph, run Louvain clustering + Isolation Forest + Random Forest classifier, wire up feature-importance explainability
- **Person C — Dashboard:** Streamlit app — file/data loader, summary stats, ranked alert table, filters
- **Person D — Visualization + integration:** pyvis graph rendering embedded in Streamlit, wire Person B's model output into Person C's dashboard, end-to-end testing

Pair B+D and A+C where possible so nobody's fully blocked waiting on someone else's output — use dummy/mock data early so dashboard work can start before the real pipeline is done.

## 7. Phase-Wise Plan

### Phase 0 — Setup (today, 30 Aug, few hours)

1. Create GitHub repo, add all 4 devs
2. Everyone sets up Python venv + installs: `pandas networkx scikit-learn streamlit pyvis geoip2`
3. Download Elliptic (Kaggle) and Elliptic++ (GitHub) datasets, drop in repo's `/data` folder
4. Sign up for MaxMind GeoLite2, get license key, download GeoLite2-City + GeoLite2-ASN
5. Confirm role split above, set up shared doc for daily sync
6. **Checkpoint:** everyone can run `import pandas, networkx, sklearn, streamlit` with no errors, raw datasets sitting in repo

### Phase 1 — Data Pipeline (31 Aug)

1. Load `txs_features.csv`, `txs_classes.csv`, `txs_edgelist.csv` (transactions)
2. Load `wallets_features.csv`, `wallets_classes.csv`, `AddrTx_edgelist.csv`, `TxAddr_edgelist.csv` (wallets)
3. Write the synthetic IP/port/timestamp generator — assign per transaction, weight "risky" IP ranges toward illicit-labeled nodes so the correlation story is visible in the demo
4. Resolve synthetic IPs through GeoLite2, attach `geo_country`/`asn`
5. Merge everything into the target schema (Section 4d), export as one clean CSV/JSON
6. **Checkpoint:** one unified dataset file, schema matches Section 4d, spot-check 10 rows manually for sanity

### Phase 2 — Graph + ML Core (1 Sept)

1. Build the NetworkX graph: wallet and transaction nodes, edges from the edgelists
2. Run Louvain community detection → entity clusters
3. Train Random Forest on Elliptic's labeled subset (illicit/licit) → predict on unlabeled nodes
4. Run Isolation Forest on the full feature set → anomaly scores
5. Combine classifier confidence + anomaly score + cluster membership into one **ranked risk score**
6. Extract top feature importances per flagged node → this becomes the "why flagged" text
7. **Checkpoint:** given the merged dataset, script outputs a ranked list of top-N suspicious wallets with score + top 2–3 contributing features

### Phase 3 — Dashboard (1–2 Sept)

1. Streamlit skeleton: file loader, summary stat cards (total tx, flagged count, avg confidence)
2. Ranked alert table: wallet/entity, confidence score, explanation, cluster ID — sortable/filterable
3. pyvis graph view: render flagged clusters, color-code by risk score, embed in Streamlit
4. Geo overlay: simple table or map showing flagged nodes' `geo_country`/`asn` distribution
5. **Checkpoint:** dashboard runs locally, loads Phase 2's output, all four views (stats, table, graph, geo) populated with real pipeline output — not mock data anymore

### Phase 4 — Integration & Polish (2–3 Sept)

1. Full end-to-end run: raw data → pipeline → dashboard, no manual steps skipped
2. Fix visual rough edges — consistent colors, readable labels, no overlapping graph nodes
3. Add a short "How it works" panel/sidebar in the dashboard explaining the pipeline (helps narrate the video)
4. Dry-run the demo flow twice as a team, time it
5. **Checkpoint:** two team members can run the full demo cold, without the original builder present, and it works

### Phase 5 — Demo Video (3 Sept)

Structure (~3–4 min total):

1. 0:00–0:30 — Problem statement in one line (pseudonymity + siloed data = undetected laundering)
2. 0:30–1:00 — What ChainTrace does (one sentence) + show the dashboard landing/summary view
3. 1:00–2:30 — Live walkthrough: load dataset → show ranked alerts → click into one flagged wallet → show explanation + cluster graph → show geo/ASN correlation
4. 2:30–3:15 — Highlight the differentiator: "this is network-layer + blockchain-layer fused, offline, explainable — not a black box like existing tools"
5. 3:15–end — Quick mention of impact + roadmap (the banking/exchange hold-queue integration from your earlier discussion, framed as Phase 2 vision)

Record in OBS/Loom, do 2–3 takes, keep the best, light edit for pacing/captions.

### Phase 6 — Buffer & Submission (3–4 Sept)

1. Final video export, upload wherever the portal needs it
2. PPT team finalizes deck using this doc's data/architecture (should already be in sync since builders fed them checkpoints along the way)
3. Submit early on 4th, not at the deadline — buffer for upload issues

## 8. Risks & Mitigations

| Risk | Likelihood | Mitigation |
|---|---|---|
| Synthetic IP generation looks obviously fake in the demo | Medium | Weight "risky" ASN ranges toward illicit-labeled nodes so the pattern is visible and defensible, not random noise |
| Louvain/RF pipeline takes longer to tune than expected | Medium | Random Forest + Louvain are both fast (minutes, not hours) — if stuck, use scikit-learn defaults, don't over-tune under time pressure |
| Dashboard/pipeline integration breaks last-minute | Medium | Person D owns integration full-time from Phase 3 onward, not a side task |
| GeoLite2 signup/download friction | Low | Do this in Phase 0, not Phase 1, so there's slack if MaxMind account verification is slow |
| Team member's laptop can't handle the graph size | Low | Subsample the Elliptic graph (e.g., 2–3 time steps instead of all 49) for the demo — still real data, much lighter |

## 9. Complexity Estimate

- Data pipeline: Medium (~6–8 hrs)
- Graph + ML core: Medium (~6–8 hrs)
- Dashboard: Medium (~8–10 hrs)
- Integration + polish: Low–Medium (~4–6 hrs)
- Video: Low (~2–3 hrs)
- **Total:** roughly 26–35 person-hours across 4 people over 4 days — comfortable, not a last-night scramble, if Phase 0 starts today.
