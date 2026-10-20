# MediCare Analytics System

A hospital inpatient analytics dashboard built on the SPARCS NY 2021 discharge dataset (2.1M+ records), combining a **hybrid PostgreSQL + MongoDB architecture** with a Flask backend and interactive Chart.js visualizations.

![Status](https://img.shields.io/badge/status-completed-brightgreen)
![Python](https://img.shields.io/badge/python-3.13-blue)
![Flask](https://img.shields.io/badge/flask-backend-black)

## Overview

Hospital inpatient data is often scattered across systems, making capacity planning and financial analysis harder than it should be. This project brings that data together into a single dashboard covering:

- **Capacity & Length of Stay** — patient distribution by service area, admission flow, bed occupancy forecasting
- **Financial** — charges by diagnosis, procedure, severity, and risk of mortality
- **Accessibility** — patient disposition and length of stay broken down by payer type
- **Network Analysis** — ED entry patterns, payment coordination flows

## Architecture

This project intentionally uses two databases together to reflect how hospital data is structured in practice:

| Database | Used for |
|---|---|
| **PostgreSQL** | Structured records — discharges, facilities, diagnosis mapping, financial facts |
| **MongoDB** | Semi-structured/nested records — payment details, clinical encounter outcomes |

Some endpoints query both databases and join the results in-memory with pandas (see `api_ed_ratio`, `api_severity_charges` in `app.py`) — a common pattern when data naturally splits across relational and document stores.

## Tech Stack

- **Backend:** Flask, SQLAlchemy, PyMongo, pandas
- **Frontend:** Chart.js, vanilla JS, Leaflet (map visualization)
- **Databases:** PostgreSQL, MongoDB
- **Deployment-ready:** Environment-variable–based config for cloud databases (MongoDB Atlas, Supabase)

## Screenshots
[Capacity & LOS panel](docs/screenshot-capacity.png)
[Financial panel](docs/screenshot-financial.png)
[Accessibility panel](docs/accessibility.png)

## Getting Started

### 1. Clone and set up environment

```bash
git clone https://github.com/GabrielleGeb/medicare-inpatient-analytics.git
cd medicare-inpatient-analytics
python -m venv .venv
source .venv/bin/activate   # Windows: .venv\Scripts\activate
pip install -r requirements.txt
```

### 2. Configure environment variables

Copy `.env.example` to `.env` and fill in your database credentials.

For local development, the app defaults to local PostgreSQL/MongoDB instances. To point it at cloud databases instead (e.g. for deployment), set:

```
USE_ATLAS=1
POSTGRES_URI=<your Postgres connection string>
MONGO_URI=<your MongoDB connection string>
```

### 3. Load the dataset

Download `hospital_inpatient.csv` from [this link](https://drive.google.com/file/d/1kjjZdmN4X0bx-2Pz20cilNVhBp46ID3P/view?usp=sharing) (not included in the repo — it's ~794MB, over GitHub's 100MB limit) and import it into PostgreSQL/MongoDB according to the schema used in `app.py`.

### 4. Run

```bash
python app.py
```

The dashboard will be available at `http://localhost:5000`.

## Project Notes

- Data source: [SPARCS NY 2021 Hospital Inpatient Discharges](https://health.data.ny.gov/)
- An earlier version of this project explored a Neo4j-based clinical pathway (procedure co-occurrence) analysis; this was ultimately not included in the final product but the ETL script (`etl_clinical_pathway.py`) is kept for reference.
- [Full technical report](https://drive.google.com/file/d/1ih4z5ms4D-KNISp6hsX_i3-nadqG3SJy/view?usp=sharing)

## Team

Edbert Nathaniel Christian Yapar · Kenenza Davelynne · Gabrielle Angelina Ambasalu

Built for the "Pemodelan Data untuk Data Science" course.
