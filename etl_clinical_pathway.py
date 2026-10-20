"""
etl_clinical_pathway.py
Build a procedure co-occurrence graph in Neo4j from MongoDB `medical_records`.

Untuk setiap discharge, ambil semua CCSR procedures yang dilakukan, lalu hitung
berapa kali tiap pasangan prosedur muncul bersamaan dalam satu admission.
Hasilnya di-push ke Neo4j sebagai graph:

    (:Procedure {code, description, total_cases})-[:CO_OCCURS_WITH {weight}]-(:Procedure)

Cara pakai:
    pip install pymongo neo4j --break-system-packages
    python etl_clinical_pathway.py

Jalankan ulang kapan saja kalau data sumber berubah — script ini akan
menghapus graph Procedure lama sebelum nge-build ulang (idempotent).
"""

import itertools
from collections import Counter

from pymongo import MongoClient
from neo4j import GraphDatabase

# ── CONFIG ───────────────────────────────────────────────────────────────────
MONGO_URI = 'mongodb://admin:admin123@localhost:27017/?authSource=admin'
MONGO_DB  = 'medicare_db'

NEO4J_URI  = 'bolt://localhost:7687'
NEO4J_USER = 'neo4j'
NEO4J_PASS = 'password123'
          # ganti sesuai password container neo4j kamu

MIN_COOCCURRENCE = 30         # buang pair yang terlalu jarang biar graph nggak penuh noise


# ── STEP 1: tarik daftar procedures per discharge dari MongoDB ───────────────
def fetch_procedure_lists():
    client = MongoClient(MONGO_URI)
    db = client[MONGO_DB]

    pipeline = [
        {"$match": {"procedures": {"$exists": True, "$ne": []}}},
        {"$project": {
            "_id": 0,
            "discharge_id": 1,
            "procedures": {
                "$map": {
                    "input": "$procedures",
                    "as": "p",
                    "in": {"code": "$$p.ccsr_code", "desc": "$$p.description"}
                }
            }
        }}
    ]

    discharges = []
    for doc in db.medical_records.aggregate(pipeline, allowDiskUse=True):
        # dedupe procedure dalam satu discharge yang sama
        seen = {}
        for p in doc.get("procedures", []):
            if p.get("code"):
                seen[p["code"]] = p.get("desc")
        if len(seen) >= 2:
            discharges.append(seen)   # dict code -> description

    client.close()
    return discharges


# ── STEP 2: hitung co-occurrence pair + total cases per procedure ────────────
def build_cooccurrence(discharges):
    pair_counter = Counter()
    case_counter = Counter()
    code_to_desc = {}

    for procs in discharges:
        codes = sorted(procs.keys())

        for code, desc in procs.items():
            case_counter[code] += 1
            code_to_desc[code] = desc

        for c1, c2 in itertools.combinations(codes, 2):
            pair_counter[(c1, c2)] += 1

    return pair_counter, case_counter, code_to_desc


# ── STEP 3: push nodes + edges ke Neo4j ───────────────────────────────────────
def push_to_neo4j(pair_counter, case_counter, code_to_desc):
    driver = GraphDatabase.driver(NEO4J_URI, auth=(NEO4J_USER, NEO4J_PASS))

    with driver.session() as session:
        session.run(
            "CREATE CONSTRAINT IF NOT EXISTS FOR (p:Procedure) REQUIRE p.code IS UNIQUE"
        )

        # bersihkan graph lama biar nggak dobel kalau script dijalanin ulang
        session.run("MATCH (p:Procedure) DETACH DELETE p")

        node_rows = [
            {"code": code, "description": desc, "total_cases": case_counter[code]}
            for code, desc in code_to_desc.items()
        ]
        session.run("""
            UNWIND $rows AS row
            MERGE (p:Procedure {code: row.code})
            SET p.description = row.description, p.total_cases = row.total_cases
        """, rows=node_rows)

        edge_rows = [
            {"c1": c1, "c2": c2, "weight": count}
            for (c1, c2), count in pair_counter.items()
            if count >= MIN_COOCCURRENCE
        ]
        session.run("""
            UNWIND $rows AS row
            MATCH (p1:Procedure {code: row.c1})
            MATCH (p2:Procedure {code: row.c2})
            MERGE (p1)-[r:CO_OCCURS_WITH]-(p2)
            SET r.weight = row.weight
        """, rows=edge_rows)

    driver.close()
    return len(node_rows), len(edge_rows)


if __name__ == "__main__":
    print("Fetching procedures from MongoDB...")
    discharges = fetch_procedure_lists()
    print(f"  {len(discharges):,} discharges with 2+ procedures")

    print("Computing co-occurrence...")
    pair_counter, case_counter, code_to_desc = build_cooccurrence(discharges)
    print(f"  {len(code_to_desc):,} distinct procedures, {len(pair_counter):,} unique pairs")

    print("Pushing to Neo4j...")
    n_nodes, n_edges = push_to_neo4j(pair_counter, case_counter, code_to_desc)
    print(f"Done — {n_nodes} nodes, {n_edges} edges (threshold >= {MIN_COOCCURRENCE})")
