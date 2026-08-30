# ChainTrace — Project Blueprint
**Smart India Hackathon 2026 · Problem Statement SIH26146 · Sponsoring Org: NTRO (National Technical Research Organisation)**
**Theme (as tagged on portal): Transportation & Logistics — mistagged; genuine domain is Blockchain & Cybersecurity**

*This document is a self-contained context brief. Anyone — teammate, new AI agent, or PPT-maker — should be able to read only this file and fully understand the project: what it is, why it matters, how it works, what's been decided, and what's left open.*

---

## 1. Project at a Glance

| | |
|---|---|
| **Project name** | ChainTrace |
| **Problem statement** | SIH26146 — AI-Powered Monitoring & Analysis of Bitcoin Transaction Traffic |
| **Sponsoring org** | NTRO (National Technical Research Organisation) |
| **Team size** | 6 |
| **Team members** | Advit Sonawane, Aditi Thorat, Tijay Shetty, Ujjwal Maywad, Swara, Ankit "Buster" Vyavahare |
| **Current status** | Prototype build in progress — see Section 9 |
| **Current focus** | ChainTrace only. A second PS (SIH26123, AMR fleet coordination) was also finalized by the team but is a stretch goal, not active work |
| **Near-term deadline** | SIH PPT + prototype demo video submission window: 1–4 September |
| **Companion document** | `ChainTrace_Prototype_Plan.md` — the phase-by-phase build execution plan (data pipeline → ML → dashboard → video). This blueprint is the *what and why*; that document is the *how, step by step*. |

---

## 2. The Problem

**Verbatim PS background:** Bitcoin's pseudonymous, peer-to-peer design lets criminal actors move, layer, and cash out illicit funds — ransomware payments, darknet-market proceeds, extortion, and laundering — while evading traditional financial surveillance.

**The specific gap NTRO is asking teams to close:** investigators today analyze two data layers in silos:
- **Network layer** — IP addresses, ports, connection timing (how a transaction was broadcast across the P2P network)
- **Blockchain layer** — wallet addresses, transaction IDs (TXIDs), amounts (what actually moved on-chain)

Nobody currently **correlates these two layers together**. Existing tools flag suspicious wallets using largely black-box scoring — no confidence levels, no explanation of *why* a wallet was flagged — which makes flagged leads hard for an investigator to act on or defend.

**Official PS deliverables required:**
1. Ingest bulk metadata (timestamp, src/dst IP & port, TXID, input/output wallet addresses, amounts, fee, script type) from CSV/JSON/XML
2. Build an entity/transaction graph linking IPs, wallets, and transactions
3. Apply a **working AI/ML model** for detection — not just static rules
4. Generate a **ranked, explainable alert list** — why a wallet/transaction was flagged, with a confidence score
5. Present findings via a dashboard or link-analysis visualization
6. The complete solution must run **offline**, on Linux

**Dataset note (from the PS itself):** SIH organizers will provide a **synthetic dataset** modeled on real Bitcoin P2P/transaction fields for the Grand Finale — not real seized/live-intercept data. This matters: it means our own approach of combining real blockchain data with synthetic network-layer data (Section 6) is directly in line with how the actual competition dataset will work, not a workaround.

---

## 3. Our Solution — ChainTrace

ChainTrace is an **offline forensic system** that fuses network-layer and blockchain-layer Bitcoin data into a single correlated view, then uses machine learning to surface **ranked, explainable investigative leads** instead of a black-box score.

**In one paragraph (usable as-is for a PPT intro slide or agent context):**
> ChainTrace is an offline forensic system that fuses two data layers criminals assume stay separate — the network layer (IP, port, timing of P2P broadcasts) and the blockchain layer (wallets, TXIDs, amounts) — into a single entity-transaction graph, then runs ML-based anomaly detection and clustering to surface ranked, explainable leads instead of raw noise, complete with a confidence score and a "why this was flagged" trace so an investigator isn't stuck trusting a black box. A link-analysis dashboard visualizes flagged wallet clusters and their geo-IP/ASN footprint, turning what's currently a manual, spreadsheet-driven investigative bottleneck into a repeatable, explainable pipeline.

### How it works, step by step
1. **Ingest** — bulk transaction/network metadata is loaded (CSV/JSON)
2. **Graph construction** — wallets, transactions, and IPs become nodes; flows of funds and network connections become edges, all in one unified graph
3. **Clustering** — community-detection algorithms group wallets into entity clusters (accounts likely controlled by the same actor)
4. **Detection** — an ML classifier (trained on labeled illicit/licit examples) and an anomaly detector score every node for suspiciousness
5. **Explainability** — each flagged node's score is broken down into the specific features that drove it (e.g., "high in-degree from known-illicit cluster," "unusual fee pattern," "risky ASN")
6. **Ranking** — all flags are sorted by confidence into a prioritized investigator worklist
7. **Visualization** — a dashboard shows the ranked list, an interactive link-analysis graph of flagged clusters, and geo/ASN distribution

---

## 4. System Architecture

```
Raw metadata (CSV/JSON)
        │
        ▼
[1] Data Ingestion & Cleaning  ─────────────► Unified schema (Section 6)
        │
        ▼
[2] Graph Construction (NetworkX)
    wallets ↔ transactions ↔ IPs as nodes, funds/connections as edges
        │
        ▼
[3] Entity Clustering (Louvain community detection)
        │
        ▼
[4] ML Detection Layer
    ├── Random Forest classifier (illicit/licit, trained on labeled data)
    └── Isolation Forest (anomaly scoring, catches novel patterns)
        │
        ▼
[5] Explainability Layer (feature importances → human-readable "why")
        │
        ▼
[6] Ranked Alert List (confidence score + reason, sorted)
        │
        ▼
[7] Dashboard (Streamlit)
    ├── Summary stats
    ├── Ranked alert table (filterable)
    ├── Interactive link-analysis graph (pyvis)
    └── Geo/ASN view
```

Everything above runs **locally, offline** — no cloud dependency, no internet call at runtime. This directly satisfies the PS's offline/Linux requirement and is also a genuine security advantage for an air-gapped investigative environment.

---

## 5. What Makes This Different (USP)

**The market context:** blockchain-analytics is dominated by closed, expensive, foreign commercial tools — Chainalysis (15M+ labelled clusters, 1,000+ institutional clients), Elliptic (coverage across 100+ blockchains), and TRM Labs (reached unicorn status, $1B valuation, Feb 2026). These are chain-data-only tools, proprietary, not independently auditable by Indian agencies, and don't emphasize network-layer correlation.

**Where ChainTrace differentiates:**

| Existing approach | ChainTrace |
|---|---|
| Blockchain-only OR network-only analysis, done separately | **Fuses both layers** into one correlated graph — the genuinely hard, novel part of this PS |
| Black-box risk score, no reasoning shown | **Confidence score + explicit "why flagged" trace** per alert |
| Static rules / known-blacklist matching | **Real ML** (classification + anomaly detection), catches novel patterns, not just known ones |
| Reactive — suspicious activity reported *after* the transaction settles | **Roadmap vision (Phase 2, not core deliverable):** risk score exposed as an API signal that exchanges/banks could plug into their existing KYC/AML pipeline, so a flagged wallet's fiat withdrawal goes into a manual-review hold *before* settlement — mirrors India's existing FIU-IND/STR compliance framework, doesn't invent a new mechanism |
| Foreign, proprietary, not independently auditable | Built offline, on-prem, from scratch — sovereign, auditable, no foreign black-box vendor dependency |
| Static report output | Designed to be integration-ready (API-exposable score) from day one |

**Important correction baked into this pitch (do not deviate from this in the PPT):** Bitcoin transactions **cannot be stopped or reversed** once broadcast — there is no central authority on a decentralized ledger. ChainTrace does **not** claim to intercept the blockchain transaction itself. The only real, technically accurate interception point is the **fiat on/off-ramp** (exchange or bank), which is why the roadmap vision is framed as a KYC/AML pre-settlement hold, not "blocking a Bitcoin transaction." This distinction matters — claiming otherwise would be factually wrong and would not survive a technically literate judge's questioning.

---

## 6. Data — Sources, Rationale, Schema

**Core challenge:** no public dataset combines real Bitcoin transactions with real network-layer (IP/port) data — that correlation is exactly what makes this PS hard, and exactly why it's worth attempting. Our approach: **real blockchain-layer data + our own synthetic network-layer data**, which mirrors exactly how SIH's own Grand Finale dataset will work (organizer-confirmed synthetic dataset modeled on real fields).

### Real data sources
- **Elliptic Data Set** (Kaggle): https://www.kaggle.com/datasets/ellipticco/elliptic-data-set
  Real Bitcoin transaction graph — 203,769 transactions, 234,355 edges, labeled illicit/licit/unknown, 166 features/node, 49 time steps.
- **Elliptic++ Dataset** (GitHub): https://github.com/git-disl/EllipticPlusPlus
  Extends Elliptic with wallet/actor-level data — 822,942 wallet address occurrences (530,840 unique), 55 features each, plus edgelists linking wallets to transactions.
- **MaxMind GeoLite2** (free, signup required): https://www.maxmind.com/en/geolite2/signup
  Real GeoIP/ASN resolution — used to genuinely geo-locate our synthetic IPs, so the geo layer is real even though the IP-to-transaction link is synthetic.

### Synthetic layer (what we generate ourselves)
Per transaction/wallet node: `src_ip`, `dst_ip`, `src_port`, `dst_port`, `timestamp` — generated with realistic ISP/hosting/Tor-like IP range weighting so illicit-labeled nodes plausibly correlate with riskier network patterns.

### Unified schema
| Column | Source |
|---|---|
| `timestamp` | Real (derived from Elliptic time-step) |
| `src_ip`, `dst_ip`, `src_port`, `dst_port` | Synthetic |
| `txid` | Real (Elliptic) |
| `input_addresses[]`, `output_addresses[]` | Real (Elliptic++) |
| `input_amounts[]`, `output_amounts[]` | Real (normalized/anonymized as provided by Elliptic) |
| `fee`, `script_type` | Real/estimated from Elliptic features |
| `geo_country`, `asn` | Real (resolved via GeoLite2 on synthetic IPs) |

**Transparency note:** this data composition is stated explicitly in our write-up and pitch — "real blockchain data, synthetic network layer, real GeoIP resolution." Judges respond better to disclosed methodology than to data that looks real but isn't explained.

---

## 7. Tech Stack

| Layer | Tool | Rationale |
|---|---|---|
| Data processing | Python, pandas | Standard, fast |
| Graph construction | NetworkX | Simple graph building, built-in community detection |
| Classification | scikit-learn Random Forest | Fast to train, and is the published strong baseline on this exact dataset — a defensible, credible choice given the timeline, not a shortcut |
| Anomaly detection | scikit-learn Isolation Forest | Catches novel patterns beyond labeled training data |
| Clustering | NetworkX Louvain community detection | Groups wallets into entity clusters |
| Explainability | scikit-learn feature importances (SHAP if time allows) | Powers the "why flagged" reasoning |
| Dashboard | Streamlit | Fast to build, runs locally, looks legitimate on camera — no deployment needed |
| Graph visualization | pyvis (embedded via Streamlit components) | Best visual payoff for the effort, interactive link-analysis view |
| **Stretch goal only** | PyTorch Geometric (`EllipticBitcoinDataset` native loader) | GNN upgrade path if core build finishes early — not required for the core deliverable |

**Deployment format:** a locally-run offline web dashboard (not a hosted public website) — this is intentional, not a limitation, since the PS explicitly requires an offline solution.

---

## 8. Team & Roles

| Member | Role (prototype phase) |
|---|---|
| Advit Sonawane | Prototype build |
| Aditi Thorat | Prototype build |
| Tijay Shetty | Prototype build |
| Ujjwal Maywad | Prototype build |
| Swara | PPT |
| Ankit "Buster" Vyavahare | PPT / coordination |

*(Detailed role-to-task mapping — data pipeline / graph+ML / dashboard / integration — is in the companion `ChainTrace_Prototype_Plan.md`.)*

---

## 9. Current Status & Roadmap

**Status:** Team has finalized the PS pair (SIH26146 primary + SIH26123 as stretch/secondary), dropped an earlier candidate (SIH26164, ECDAT — same org/theme as ChainTrace, team wanted differentiated picks), and is now executing the prototype build per the companion phase plan, targeting a demo video for the 1–4 September PPT submission window.

**Phase 1 (current, what we're actually building and demoing):** the offline forensic correlation-and-detection tool described in Sections 3–7. This is the PS's actual ask and our entire near-term deliverable.

**Phase 2 (roadmap vision — pitch slide only, NOT part of the build):** risk score exposed via API, pluggable into an exchange/bank's existing KYC/AML pipeline, so a flagged wallet's fiat withdrawal triggers a manual-review hold before settlement — mapped to India's existing FIU-IND/Suspicious Transaction Report framework. This shows judges vision and real-world deployment thinking without overclaiming what a 36-hour/PPT-round build can or should attempt.

---

## 10. Key Decisions Log

*(For continuity — so nobody re-litigates settled questions, and any new AI agent picking this up knows what's already been decided and why.)*

1. **PS pair finalized:** SIH26146 (ChainTrace) + SIH26123 (AMR fleet coordination). ChainTrace is active; AMR is stretch-goal only for now.
2. **SIH26164 (ECDAT) was dropped** — team wanted the two PS from different orgs/themes rather than both being NTRO/Blockchain-Cybersecurity; also had internal doubts about ECDAT's "SIH-level" impact narrative.
3. **"Stop the transaction mid-process" was corrected** — Bitcoin transactions cannot be intercepted on-chain once broadcast. The banking/AML integration is a Phase 2 roadmap slide, framed correctly around the fiat on/off-ramp, not the blockchain layer itself.
4. **Data approach settled:** real Elliptic/Elliptic++ data + self-generated synthetic network-layer data + real GeoLite2 resolution — chosen because no public dataset combines real Bitcoin data with real IP/network telemetry, and because this mirrors SIH's own confirmed synthetic-dataset approach for the Grand Finale.
5. **Deployment format settled:** local offline Streamlit dashboard, not a hosted website — matches the PS's explicit offline requirement.

---

## 11. Glossary

| Term | Meaning |
|---|---|
| **TXID** | Transaction ID — unique identifier for a Bitcoin transaction |
| **Wallet/Address clustering** | Grouping multiple Bitcoin addresses believed to be controlled by the same real-world actor |
| **Peel chain** | A laundering pattern where funds are repeatedly split off in small amounts across many transactions to obscure the trail |
| **Mixing/tumbling** | Deliberately pooling and redistributing funds across many wallets to break the traceable link between sender and receiver |
| **ASN** | Autonomous System Number — identifies which network/ISP an IP address belongs to |
| **GeoIP** | Resolving an IP address to an approximate real-world geographic location |
| **Confidence score** | A numeric measure of how certain the model is that a flagged wallet/transaction is actually suspicious |
| **Explainability** | Showing *why* a model made a decision (e.g., which features drove a flag), not just the decision itself |
| **KYC/AML** | Know Your Customer / Anti-Money Laundering — the compliance framework banks and exchanges must follow |
| **STR** | Suspicious Transaction Report — a filing banks/exchanges in India are legally required to make to FIU-IND when they detect suspicious activity |
| **FIU-IND** | Financial Intelligence Unit — India, the government body that receives STRs |
| **Offline/air-gapped** | A system with no live internet dependency at runtime — required by this PS for security/sovereignty reasons |

---

## 12. Quick Reference / Elevator Pitch

*(Drop-in for the first slide of the PPT or the opening line of any explanation to a new agent/teammate.)*

> ChainTrace is an offline AI system built for NTRO (SIH26146) that correlates Bitcoin's network-layer data (IP, port, timing) with its blockchain-layer data (wallets, transactions, amounts) — something no existing tool does — to generate ranked, explainable investigative leads for tracking ransomware, darknet, and laundering funds, without relying on a black-box score or a foreign proprietary vendor.
