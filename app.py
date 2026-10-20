from flask import Flask, render_template, jsonify
from sqlalchemy import create_engine, text
from pymongo import MongoClient
import pandas as pd
import json
import os

app = Flask(__name__)

# ── Database connections ──────────────────────────────────────────────────────
# Lokal (data lengkap 2.1 juta dokumen) dipakai secara default.
# Set env var USE_ATLAS=1 kalau mau app ini jalan pakai data sample di Atlas
# (misal pas deploy ke Render/Railway, di mana localhost nggak bisa diakses).
USE_ATLAS = os.environ.get('USE_ATLAS', '0') == '1'

POSTGRES_LOCAL_URI = 'postgresql://hamerin@localhost:5432/medicare_db'
POSTGRES_ATLAS_URI = os.environ.get(
    'POSTGRES_URI',
    "postgresql://postgres.ocimnazdcyhypqgqhohu:Mgr8x!Qp2vTnZ9wL@aws-0-ap-southeast-2.pooler.supabase.com:5432/postgres"
)

MONGO_LOCAL_URI = 'mongodb://admin:admin123@localhost:27017/?authSource=admin'
MONGO_ATLAS_URI = 'mongodb+srv://gabyangel1410_db_user:A0a2CVmbdyGXbaOE@cluster0.yk481e6.mongodb.net/?appName=Cluster0'

engine = create_engine(POSTGRES_ATLAS_URI if USE_ATLAS else POSTGRES_LOCAL_URI)
mongo = MongoClient(MONGO_ATLAS_URI if USE_ATLAS else MONGO_LOCAL_URI)
db     = mongo['medicare_db']

# ── Routes ────────────────────────────────────────────────────────────────────
@app.route('/')
def index():
    return render_template('index.html')

# Problem 1 — LOS per service area × age group

# Problem 1 — ED ratio per service area (MongoDB + PostgreSQL JOIN)
_cache = {}

@app.route('/api/ed-ratio')
def api_ed_ratio():
    if 'ed_ratio' in _cache:
        return jsonify(_cache['ed_ratio'])

    # Step 1: Aggregate ED indicator dari MongoDB per discharge_id
    pipeline = [
        { "$project": {
            "_id": 0,
            "discharge_id": 1,
            "indicator": "$encounter_outcome.emergency_department_indicator"
        }},
        { "$match": { "indicator": { "$in": ["Y", "N"] } } }
    ]
    mongo_df = pd.DataFrame(
        list(db.payment_details.aggregate(pipeline, allowDiskUse=True))
    )

    # Step 2: Ambil service area dari PostgreSQL
    query = text("""
        SELECT d.discharge_id, f.hospital_service_area AS area
        FROM inpatient_discharges d
        JOIN facilities f ON d.permanent_facility_id = f.permanent_facility_id
    """)
    with engine.connect() as conn:
        pg_df = pd.read_sql(query, conn)

    # Step 3: JOIN di pandas
    merged = pd.merge(mongo_df, pg_df, on='discharge_id', how='inner')

    # Step 4: Aggregate per area
    grouped = merged.groupby(['area', 'indicator']).size().reset_index(name='count')
    pivot = grouped.pivot(index='area', columns='indicator', values='count').fillna(0).reset_index()
    pivot.columns.name = None

    pivot['Y'] = pivot.get('Y', 0)
    pivot['N'] = pivot.get('N', 0)
    pivot['total'] = pivot['Y'] + pivot['N']
    pivot['ed_pct'] = (pivot['Y'] / pivot['total'] * 100).round(1)

    result = pivot.rename(columns={'Y': 'ed', 'N': 'non_ed'})[
        ['area', 'ed', 'non_ed', 'total', 'ed_pct']
    ].to_dict(orient='records')

    _cache['ed_ratio'] = result
    return jsonify(result)


@app.route('/api/los')
def api_los():
    query = text("""
        SELECT
            f.hospital_service_area AS area,
            d.age_group,
            COUNT(*) AS total_pasien,
            ROUND(AVG(d.length_of_stay)::numeric, 2) AS avg_los
        FROM inpatient_discharges d
        JOIN facilities f ON d.permanent_facility_id = f.permanent_facility_id
        GROUP BY f.hospital_service_area, d.age_group
        ORDER BY area, avg_los DESC
    """)
    with engine.connect() as conn:
        df = pd.read_sql(query, conn)
    return jsonify(df.to_dict(orient='records'))

# Problem 1 — Patient distribution per service area (for map)
@app.route('/api/patient-distribution')
def api_patient_distribution():
    query = text("""
        SELECT
            f.hospital_service_area AS service_area,
            COUNT(*) AS total_patients
        FROM inpatient_discharges d
        JOIN facilities f ON d.permanent_facility_id = f.permanent_facility_id
        GROUP BY f.hospital_service_area
        ORDER BY total_patients DESC
    """)
    with engine.connect() as conn:
        df = pd.read_sql(query, conn)

    # Hardcode koordinat 8 NY Service Areas
    coords = {
        'New York City':    {'lat': 40.7128, 'lng': -74.0060},
        'Long Island':      {'lat': 40.7891, 'lng': -73.1350},
        'Hudson Valley':    {'lat': 41.7004, 'lng': -74.0299},
        'Capital/Adirond':  {'lat': 42.8864, 'lng': -73.9596},
        'Central NY':       {'lat': 43.0481, 'lng': -76.1474},
        'Finger Lakes':     {'lat': 42.9634, 'lng': -77.0560},
        'Western NY':       {'lat': 42.8864, 'lng': -78.8784},
        'Southern Tier':    {'lat': 42.0987, 'lng': -76.8077},
    }

    result = []
    for _, row in df.iterrows():
        area = row['service_area']
        if area in coords:
            result.append({
                'service_area': area,
                'total_patients': int(row['total_patients']),
                'lat': coords[area]['lat'],
                'lng': coords[area]['lng'],
            })

    return jsonify(result)

@app.route('/api/patient-distribution-county')
def api_patient_distribution_county():
    query = text("""
        SELECT
            f.hospital_service_area AS service_area,
            f.hospital_county AS county,
            COUNT(*) AS total_patients
        FROM inpatient_discharges d
        JOIN facilities f ON d.permanent_facility_id = f.permanent_facility_id
        WHERE f.hospital_county IS NOT NULL
        GROUP BY f.hospital_service_area, f.hospital_county
        ORDER BY service_area, total_patients DESC
    """)
    with engine.connect() as conn:
        df = pd.read_sql(query, conn)

    result = {}
    for area, group in df.groupby('service_area'):
        result[area] = group[['county', 'total_patients']].to_dict(orient='records')

    return jsonify(result)    

# Problem 1 — Admission flow & ED ratio per service area
@app.route('/api/admission-flow')
def api_admission_flow():
    query = text("""
        SELECT
            f.hospital_service_area AS area,
            d.type_of_admission,
            COUNT(*) AS total
        FROM inpatient_discharges d
        JOIN facilities f ON d.permanent_facility_id = f.permanent_facility_id
        WHERE d.type_of_admission IS NOT NULL
        GROUP BY f.hospital_service_area, d.type_of_admission
        ORDER BY area, total DESC
    """)
    with engine.connect() as conn:
        df = pd.read_sql(query, conn)
    return jsonify(df.to_dict(orient='records'))

# Problem 1 — Top diagnosis per service area
@app.route('/api/top-diagnosis-area')
def api_top_diagnosis_area():
    query = text("""
        SELECT
            f.hospital_service_area AS area,
            dm.ccsr_diagnosis_description AS diagnosis,
            COUNT(*) AS total
        FROM inpatient_discharges d
        JOIN facilities f ON d.permanent_facility_id = f.permanent_facility_id
        JOIN diagnosis_map dm ON d.discharge_id = dm.discharge_id
        WHERE dm.ccsr_diagnosis_description IS NOT NULL
        GROUP BY f.hospital_service_area, dm.ccsr_diagnosis_description
        ORDER BY area, total DESC
    """)
    with engine.connect() as conn:
        df = pd.read_sql(query, conn)

    # Ambil top 5 per area
    result = []
    for area, group in df.groupby('area'):
        top5 = group.nlargest(5, 'total')
        for _, row in top5.iterrows():
            result.append({
                'area': row['area'],
                'diagnosis': row['diagnosis'],
                'total': int(row['total'])
            })
    return jsonify(result)

# Problem 1 — Disease category distribution
# Problem 1 — Disease category distribution
@app.route('/api/disease-category')
def api_disease_category():
    query = text("""
        SELECT
            dm.ccsr_diagnosis_code AS code,
            dm.ccsr_diagnosis_description AS diagnosis,
            COUNT(*) AS total
        FROM inpatient_discharges d
        JOIN diagnosis_map dm ON d.discharge_id = dm.discharge_id
        WHERE dm.ccsr_diagnosis_description IS NOT NULL
        AND dm.ccsr_diagnosis_code IS NOT NULL
        GROUP BY dm.ccsr_diagnosis_code, dm.ccsr_diagnosis_description
        ORDER BY total DESC
    """)
    with engine.connect() as conn:
        df = pd.read_sql(query, conn)

    def categorize(code):
        if not code:
            return 'Other'
        prefix = str(code)[:3].upper()
        mapping = {
            'INF': 'Infectious & Parasitic Diseases',
            'NEO': 'Neoplasms',
            'BLD': 'Blood & Immune Disorders',
            'END': 'Endocrine, Nutritional & Metabolic',
            'MBD': 'Mental & Behavioral Disorders',
            'NVS': 'Nervous System Diseases',
            'EYE': 'Eye Diseases',
            'EAR': 'Ear & Mastoid Diseases',
            'CIR': 'Circulatory System Diseases',
            'RSP': 'Respiratory System Diseases',
            'DIG': 'Digestive System Diseases',
            'SKN': 'Skin & Subcutaneous Diseases',
            'MUS': 'Musculoskeletal Diseases',
            'GEN': 'Genitourinary System Diseases',
            'INJ': 'Injury & Poisoning',
            'FAC': 'Health Status Factors',
            'SYM': 'Symptoms & Abnormal Findings',
            'MAL': 'External Causes',
            'PRG': 'Pregnancy & Childbirth',
            'PNL': 'Perinatal Conditions',
        }
        return mapping.get(prefix, 'Other')

    df['category'] = df['code'].apply(categorize)
    summary = df.groupby('category')['total'].sum().reset_index()
    summary = summary.sort_values('total', ascending=False)

    details = {}
    for cat, group in df.groupby('category'):
        top10 = group.nlargest(10, 'total')[['diagnosis', 'total']]
        details[cat] = top10.to_dict(orient='records')

    return jsonify({
        'summary': summary.to_dict(orient='records'),
        'details': details
    })

# ── PROBLEM 1 — BED OCCUPANCY PROJECTION ──────────────────────────────────────
@app.route('/api/bed-occupancy')
def api_bed_occupancy():
    """
    Proyeksi kebutuhan bed berdasarkan formula:
    Avg Occupied Beds = (Total discharges / 365) × Avg LOS
    
    Recommended = Avg Occupied × (1 + buffer %)
    """
    query = text("""
        SELECT
            f.hospital_service_area AS area,
            COUNT(*) as total_discharges,
            ROUND(AVG(d.length_of_stay)::numeric, 1) as avg_los,
            ROUND(((COUNT(*)::numeric / 365) * AVG(d.length_of_stay))::numeric, 1) as avg_occupied_beds,
            ROUND(((COUNT(*)::numeric / 365) * AVG(d.length_of_stay) * 1.2)::numeric, 1) as recommended_beds_20pct_buffer,
            ROUND(((COUNT(*)::numeric / 365) * AVG(d.length_of_stay) * 1.3)::numeric, 1) as recommended_beds_30pct_buffer
        FROM inpatient_discharges d
        JOIN facilities f ON d.permanent_facility_id = f.permanent_facility_id
        GROUP BY f.hospital_service_area
        ORDER BY hospital_service_area, avg_occupied_beds DESC
    """)
        
    with engine.connect() as conn:
        df = pd.read_sql(query, conn)
    
    return jsonify(df.to_dict(orient='records'))


# @app.route('/api/bed-occupancy-facility')
# def api_bed_occupancy_facility():
#     """
#     Proyeksi kebutuhan bed per facility (rumah sakit individual)
#     Top 30 hospitals untuk capacity planning detail
#     """
#     query = text("""
#         SELECT
#             f.permanent_facility_id,
#             f.facility_name,
#             f.hospital_service_area,
#             COUNT(*) as total_discharges,
#             ROUND(AVG(d.length_of_stay)::numeric, 1) as avg_los,
#             ROUND((COUNT(*)::numeric / 365) * AVG(d.length_of_stay), 1) as avg_occupied_beds,
#             ROUND((COUNT(*)::numeric / 365) * AVG(d.length_of_stay) * 1.25, 1) as recommended_beds
#         FROM inpatient_discharges d
#         JOIN facilities f ON d.permanent_facility_id = f.permanent_facility_id
#         GROUP BY f.permanent_facility_id, f.facility_name, f.hospital_service_area
#         ORDER BY avg_occupied_beds DESC
#         LIMIT 30
#     """)
    
#     with engine.connect() as conn:
#         df = pd.read_sql(query, conn)
    
#     return jsonify(df.to_dict(orient='records'))

@app.route('/api/bed-occupancy-facility')
def api_bed_occupancy_facility():
    """
    Proyeksi kebutuhan bed per facility (rumah sakit individual)
    """
    query = text("""
        SELECT
            f.permanent_facility_id,
            f.facility_name,
            f.hospital_service_area,
            COUNT(*) as total_discharges,
            ROUND(AVG(d.length_of_stay)::numeric, 1) as avg_los,
            ROUND(((COUNT(*)::numeric / 365) * AVG(d.length_of_stay))::numeric, 1) as avg_occupied_beds,
            ROUND(((COUNT(*)::numeric / 365) * AVG(d.length_of_stay) * 1.25)::numeric, 1) as recommended_beds
        FROM inpatient_discharges d
        JOIN facilities f ON d.permanent_facility_id = f.permanent_facility_id
        GROUP BY f.permanent_facility_id, f.facility_name, f.hospital_service_area
        ORDER BY hospital_service_area, avg_occupied_beds DESC
        LIMIT 500
    """)
    
    with engine.connect() as conn:
        df = pd.read_sql(query, conn)
    
    return jsonify(df.to_dict(orient='records'))

# Problem 2 — top diagnosis by avg charges
@app.route('/api/charges')
def api_charges():
    query = text("""
        SELECT
            dm.ccsr_diagnosis_description AS diagnosis,
            ROUND(AVG(CAST(
                REGEXP_REPLACE(f.total_charges::text, '[^0-9.]', '', 'g')
            AS NUMERIC)), 0) AS avg_charges,
            COUNT(*) AS total_kasus
        FROM financial_facts f
        JOIN diagnosis_map dm ON f.discharge_id = dm.discharge_id
        WHERE dm.ccsr_diagnosis_description IS NOT NULL
        GROUP BY dm.ccsr_diagnosis_description
        ORDER BY avg_charges DESC
        LIMIT 15
    """)
    with engine.connect() as conn:
        df = pd.read_sql(query, conn)
    return jsonify(df.to_dict(orient='records'))

# Problem 2 — Biaya per diagnosa per service area
@app.route('/api/charges-by-area')
def api_charges_by_area():
    query = text("""
        SELECT
            f.hospital_service_area AS area,
            dm.ccsr_diagnosis_description AS diagnosis,
            ROUND(AVG(CAST(
                REGEXP_REPLACE(ff.total_charges::text, '[^0-9.]', '', 'g')
            AS NUMERIC)), 0) AS avg_charges
        FROM financial_facts ff
        JOIN inpatient_discharges d ON ff.discharge_id = d.discharge_id
        JOIN facilities f ON d.permanent_facility_id = f.permanent_facility_id
        JOIN diagnosis_map dm ON ff.discharge_id = dm.discharge_id
        WHERE dm.ccsr_diagnosis_description IS NOT NULL
        GROUP BY f.hospital_service_area, dm.ccsr_diagnosis_description
        ORDER BY avg_charges DESC
    """)
    with engine.connect() as conn:
        df = pd.read_sql(query, conn)

    result = {}
    for area, group in df.groupby('area'):
        top10 = group.nlargest(10, 'avg_charges')
        result[area] = top10.to_dict(orient='records')

    return jsonify(result)

# Problem 2 — Treemap: total charges per CCSR
@app.route('/api/charges-treemap')
def api_charges_treemap():
    query = text("""
        SELECT
            dm.ccsr_diagnosis_description AS diagnosis,
            COUNT(*) AS total_cases,
            ROUND(AVG(CAST(
                REGEXP_REPLACE(ff.total_charges::text, '[^0-9.]', '', 'g')
            AS NUMERIC)), 0) AS avg_charges,
            ROUND(SUM(CAST(
                REGEXP_REPLACE(ff.total_charges::text, '[^0-9.]', '', 'g')
            AS NUMERIC)), 0) AS total_charges
        FROM financial_facts ff
        JOIN diagnosis_map dm ON ff.discharge_id = dm.discharge_id
        WHERE dm.ccsr_diagnosis_description IS NOT NULL
        GROUP BY dm.ccsr_diagnosis_description
        ORDER BY total_charges DESC
        LIMIT 20
    """)
    with engine.connect() as conn:
        df = pd.read_sql(query, conn)
    return jsonify(df.to_dict(orient='records'))

# Problem 2 — Severity vs avg charges (MongoDB + PostgreSQL JOIN)
@app.route('/api/severity-charges')
def api_severity_charges():
    if 'severity_charges' in _cache:
        return jsonify(_cache['severity_charges'])

    pipeline = [
        { "$project": {
            "_id": 0,
            "discharge_id": 1,
            "severity": "$clinical_profile.apr_severity",
            "risk": "$clinical_profile.apr_risk_of_mortality"
        }},
        { "$match": {
            "severity": { "$in": ["Minor", "Moderate", "Major", "Extreme"] }
        }}
    ]
    mongo_df = pd.DataFrame(
        list(db.medical_records.aggregate(pipeline, allowDiskUse=True))
    )

    query = text("""
        SELECT discharge_id,
               CAST(REGEXP_REPLACE(total_charges::text, '[^0-9.]', '', 'g') AS NUMERIC) AS charges
        FROM financial_facts
        WHERE total_charges IS NOT NULL
    """)
    with engine.connect() as conn:
        pg_df = pd.read_sql(query, conn)

    merged = pd.merge(mongo_df, pg_df, on='discharge_id', how='inner')

    severity_order = ['Minor', 'Moderate', 'Major', 'Extreme']
    result = merged.groupby('severity')['charges'].agg(
        avg_charges='mean',
        total_cases='count'
    ).reset_index()
    result['avg_charges'] = result['avg_charges'].round(0).astype(int)
    result['severity'] = pd.Categorical(result['severity'], categories=severity_order, ordered=True)
    result = result.sort_values('severity').to_dict(orient='records')

    _cache['severity_charges'] = result
    return jsonify(result)

# Problem 2 — Top procedures by avg charges (MongoDB + PostgreSQL JOIN)
@app.route('/api/procedure-charges')
def api_procedure_charges():
    if 'procedure_charges' in _cache:
        return jsonify(_cache['procedure_charges'])

    # Step 1: Ambil procedures dari MongoDB
    pipeline = [
        { "$unwind": "$procedures" },
        { "$project": {
            "_id": 0,
            "discharge_id": 1,
            "procedure": "$procedures.description"
        }},
        { "$match": { "procedure": { "$exists": True, "$ne": None } } }
    ]
    mongo_df = pd.DataFrame(
        list(db.medical_records.aggregate(pipeline, allowDiskUse=True))
    )

    # Step 2: Ambil charges dari PostgreSQL
    query = text("""
        SELECT discharge_id,
               CAST(REGEXP_REPLACE(total_charges::text, '[^0-9.]', '', 'g') AS NUMERIC) AS charges
        FROM financial_facts
        WHERE total_charges IS NOT NULL
    """)
    with engine.connect() as conn:
        pg_df = pd.read_sql(query, conn)

    # Step 3: JOIN
    merged = pd.merge(mongo_df, pg_df, on='discharge_id', how='inner')

    # Step 4: Aggregate per procedure
    result = merged.groupby('procedure')['charges'].agg(
        avg_charges='mean',
        total_cases='count'
    ).reset_index()
    result['avg_charges'] = result['avg_charges'].round(0).astype(int)
    result = result.sort_values('avg_charges', ascending=False).head(15)
    result = result.to_dict(orient='records')

    _cache['procedure_charges'] = result
    return jsonify(result)

# Problem 2 — Risk of mortality vs avg charges (MongoDB + PostgreSQL JOIN)
@app.route('/api/mortality-charges')
def api_mortality_charges():
    if 'mortality_charges' in _cache:
        return jsonify(_cache['mortality_charges'])

    # Step 1: Ambil risk dari MongoDB
    pipeline = [
        { "$project": {
            "_id": 0,
            "discharge_id": 1,
            "risk": "$clinical_profile.apr_risk_of_mortality"
        }},
        { "$match": {
            "risk": { "$in": ["Minor", "Moderate", "Major", "Extreme"] }
        }}
    ]
    mongo_df = pd.DataFrame(
        list(db.medical_records.aggregate(pipeline, allowDiskUse=True))
    )

    # Step 2: Ambil charges dari PostgreSQL
    query = text("""
        SELECT discharge_id,
               CAST(REGEXP_REPLACE(total_charges::text, '[^0-9.]', '', 'g') AS NUMERIC) AS charges
        FROM financial_facts
        WHERE total_charges IS NOT NULL
    """)
    with engine.connect() as conn:
        pg_df = pd.read_sql(query, conn)

    # Step 3: JOIN
    merged = pd.merge(mongo_df, pg_df, on='discharge_id', how='inner')

    # Step 4: Aggregate
    risk_order = ['Minor', 'Moderate', 'Major', 'Extreme']
    result = merged.groupby('risk')['charges'].agg(
        avg_charges='mean',
        total_cases='count'
    ).reset_index()
    result['avg_charges'] = result['avg_charges'].round(0).astype(int)
    result['risk'] = pd.Categorical(result['risk'], categories=risk_order, ordered=True)
    result = result.sort_values('risk').to_dict(orient='records')

    _cache['mortality_charges'] = result
    return jsonify(result)

# Problem 3 — payer vs disposition (MongoDB)
@app.route('/api/payer')
def api_payer():
    pipeline = [
        { "$unwind": "$insurance_info.payment_typologies" },
        { "$group": {
            "_id": {
                "payer": "$insurance_info.payment_typologies",
                "disposition": "$encounter_outcome.patient_disposition"
            },
            "count": { "$sum": 1 }
        }},
        { "$sort": { "count": -1 } },
        { "$limit": 60 }
    ]
    results = list(db.payment_details.aggregate(pipeline))
    data = [{
        "payer": r["_id"]["payer"],
        "disposition": r["_id"]["disposition"],
        "count": r["count"]
    } for r in results if r["_id"]["payer"] and r["_id"]["disposition"]]
    return jsonify(data)

# Problem 3 — LOS per payer (MongoDB + PostgreSQL JOIN)
@app.route('/api/los-by-payer')
def api_los_by_payer():
    if 'los_by_payer' in _cache:
        return jsonify(_cache['los_by_payer'])

    pipeline = [
        { "$project": {
            "_id": 0,
            "discharge_id": 1,
            "payer": { "$arrayElemAt": ["$insurance_info.payment_typologies", 0] }
        }},
        { "$match": { "payer": { "$exists": True, "$ne": None } } }
    ]
    mongo_df = pd.DataFrame(
        list(db.payment_details.aggregate(pipeline, allowDiskUse=True))
    )

    query = text("""
        SELECT discharge_id, length_of_stay AS los
        FROM inpatient_discharges
        WHERE length_of_stay IS NOT NULL
    """)
    with engine.connect() as conn:
        pg_df = pd.read_sql(query, conn)

    merged = pd.merge(mongo_df, pg_df, on='discharge_id', how='inner')

    result = merged.groupby('payer')['los'].agg(
        avg_los='mean',
        total_cases='count'
    ).reset_index()
    result['avg_los'] = result['avg_los'].round(1)
    result = result.sort_values('avg_los', ascending=False).to_dict(orient='records')

    _cache['los_by_payer'] = result
    return jsonify(result)

@app.route('/api/ed-by-admission-type')
def api_ed_by_admission_type():
    # Step 1: Ambil ED indicator dari MongoDB
    pipeline = [
        { "$project": {
            "_id": 0,
            "discharge_id": 1,
            "indicator": "$encounter_outcome.emergency_department_indicator"
        }},
        { "$match": { "indicator": { "$in": ["Y", "N"] } } }
    ]
    mongo_df = pd.DataFrame(
        list(db.payment_details.aggregate(pipeline, allowDiskUse=True))
    )

    # Step 2: Ambil type_of_admission dari PostgreSQL
    query = text("""
        SELECT discharge_id, type_of_admission
        FROM inpatient_discharges
        WHERE type_of_admission IS NOT NULL
    """)
    with engine.connect() as conn:
        pg_df = pd.read_sql(query, conn)

    # Step 3: JOIN
    merged = pd.merge(mongo_df, pg_df, on='discharge_id', how='inner')

    # Step 4: Aggregate
    grouped = merged.groupby(['type_of_admission', 'indicator']).size().reset_index(name='count')
    pivot = grouped.pivot(index='type_of_admission', columns='indicator', values='count').fillna(0).reset_index()
    pivot.columns.name = None

    pivot['Y'] = pivot.get('Y', 0)
    pivot['N'] = pivot.get('N', 0)
    pivot['total'] = pivot['Y'] + pivot['N']
    pivot['ed_pct'] = (pivot['Y'] / pivot['total'] * 100).round(1)

    result = pivot.rename(columns={'Y': 'ed', 'N': 'non_ed', 'type_of_admission': 'type'})[
        ['type', 'ed', 'non_ed', 'total', 'ed_pct']
    ].sort_values('ed_pct', ascending=False).to_dict(orient='records')

    return jsonify(result)

# Problem 3 — Payment coordination (MongoDB)
@app.route('/api/payment-coordination')
def api_payment_coordination():
    pipeline = [
        { "$project": {
            "_id": 0,
            "primary": { "$arrayElemAt": ["$insurance_info.payment_typologies", 0] },
            "secondary": { "$arrayElemAt": ["$insurance_info.payment_typologies", 1] },
        }},
        { "$match": {
            "primary": { "$exists": True, "$ne": None },
            "$expr": { "$ne": ["$primary", "$secondary"] }
        }},
        { "$group": {
            "_id": {
                "primary": "$primary",
                "secondary": { "$ifNull": ["$secondary", "None"] }
            },
            "count": { "$sum": 1 }
        }},
        { "$sort": { "count": -1 } },
        { "$limit": 30 }
    ]
    results = list(db.payment_details.aggregate(pipeline))
    data = [{
        "primary": r["_id"]["primary"],
        "secondary": r["_id"]["secondary"],
        "count": r["count"]
    } for r in results]
    return jsonify(data)

# Summary stats for header cards
@app.route('/api/stats')
def api_stats():
    with engine.connect() as conn:
        total = conn.execute(text("SELECT COUNT(*) FROM inpatient_discharges")).scalar()
        hospitals = conn.execute(text("SELECT COUNT(*) FROM facilities")).scalar()
        avg_los = conn.execute(text("""
            SELECT ROUND(AVG(length_of_stay)::numeric, 1) FROM inpatient_discharges
        """)).scalar()
        avg_charge = conn.execute(text("""
            SELECT ROUND(AVG(CAST(
                REGEXP_REPLACE(total_charges::text, '[^0-9.]', '', 'g')
            AS NUMERIC)), 0) FROM financial_facts
        """)).scalar()
    return jsonify({
        "total_patients": f"{int(total):,}",
        "hospitals": int(hospitals),
        "avg_los": float(avg_los),
        "avg_charge": f"${int(avg_charge):,}"
    })

if __name__ == '__main__':
    app.run(debug=True, port=5000)