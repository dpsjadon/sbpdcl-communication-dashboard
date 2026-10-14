# SBPDCL Unified Smart Meter, DT Meter & Feeder Meter Communication Intelligence Platform

Enterprise-grade executive analytics platform for monitoring Smart Meter, Distribution Transformer (DT/DTR) Meter, and Feeder Meter (11kV & 33kV) communication across South Bihar Power Distribution Company Limited (SBPDCL).

## Key Features

- **Multi-Category Executive Monitoring**:
  - **Consumer Smart Meters (1.11M+ Meters)**: Phase-wise (1-Phase / 3-Phase) breakdown, HES-Airtel (GPRS) vs. HES-Cyan (RF mesh) communication analysis, and aging analysis (<=3D, 4-7D, >7D, Never Comm).
  - **Distribution Transformer (DT) Meters (79.3K+ Meters)**: Capacity rating drilldowns (16, 25, 63, 100, 200 kVA), modem installation tracking, and inactive DTR exclusion filters.
  - **Feeder Meters (3.3K+ Feeders)**: 11 kV & 33 kV voltage level segmentation, urban vs. rural classification, and inactive feeder reconciliation.
- **Dynamic Multi-Dimensional Slicing**: Slices circle, division, section, make, and aging buckets in real-time powered by DuckDB in-memory columnar execution.
- **Full Meter Explorer & Data Export**: Instant pagination, search by MSN, Consumer ID, Feeder, or Substation, and CSV export for field teams.
- **Multi-Report Downloader Hub**: Modular crawler pipeline for automated synchronization with SBPDCL MDMS portal.
- **Cloud-Ready 24/7 Availability**: Packaged with a compressed seed analytical database for zero-latency hosting on Render.com or any container environment.

## Architecture

- **Backend**: Node.js, Express, DuckDB (Columnar analytical engine)
- **Frontend**: Vanilla JavaScript (ES6+), Modern Glassmorphic CSS Design System, Chart.js, Lucide Icons
- **Deployment**: Render.com Web Service / Docker / Local Service

## Running Locally

```bash
# Install dependencies
npm install

# Start the dashboard server
npm start
```

Access the dashboard at `http://localhost:8098`.

## Cloud Deployment (Render.com)

1. Push this repository to GitHub (`dpsjadon/sbpdcl-communication-dashboard`).
2. Log in to [Render.com](https://render.com).
3. Click **New +** -> **Web Service**.
4. Select the repository `sbpdcl-communication-dashboard`.
5. Configuration:
   - **Runtime**: `Node`
   - **Build Command**: `npm install`
   - **Start Command**: `npm start`
   - **Plan**: `Free`
6. Click **Deploy Web Service**.
