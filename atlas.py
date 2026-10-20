from pymongo import MongoClient
import sys

# ── CONFIG ───────────────────────────────────────────────────────────────────
LOCAL_URI = "mongodb://admin:admin123@localhost:27017/?authSource=admin"
ATLAS_URI = "mongodb+srv://gabyangel1410_db_user:A0a2CVmbdyGXbaOE@cluster0.yk481e6.mongodb.net/?appName=Cluster0"

DB_NAME = "medicare_db"
COLLECTIONS = ["medical_records", "payment_details"]

SAMPLE_SIZE = 350_000  # dokumen per koleksi -- cukup buat demo, jauh di bawah limit 512MB
BATCH_SIZE = 5_000     # insert per batch biar nggak overload sekali kirim


def main():
    print("Connecting to local MongoDB...")
    local_client = MongoClient(LOCAL_URI)
    local_db = local_client[DB_NAME]

    print("Connecting to Atlas...")
    atlas_client = MongoClient(ATLAS_URI)
    atlas_db = atlas_client[DB_NAME]

    for coll_name in COLLECTIONS:
        print(f"\n=== {coll_name} ===")
        local_coll = local_db[coll_name]
        atlas_coll = atlas_db[coll_name]

        # Kosongkan collection di Atlas dulu (biar nggak dobel kalau script dijalanin ulang)
        atlas_coll.delete_many({})

        total_local = local_coll.estimated_document_count()
        print(f"Total dokumen lokal: {total_local:,}")
        print(f"Mengambil sample: {SAMPLE_SIZE:,} dokumen (random sample)")

        # Random sample pakai aggregation $sample -- representatif, bukan cuma N pertama
        pipeline = [{"$sample": {"size": SAMPLE_SIZE}}]
        cursor = local_coll.aggregate(pipeline, allowDiskUse=True)

        batch = []
        inserted = 0
        for doc in cursor:
            batch.append(doc)
            if len(batch) >= BATCH_SIZE:
                atlas_coll.insert_many(batch, ordered=False)
                inserted += len(batch)
                print(f"  Inserted {inserted:,} / {SAMPLE_SIZE:,}", end="\r")
                batch = []

        if batch:
            atlas_coll.insert_many(batch, ordered=False)
            inserted += len(batch)

        print(f"  Inserted {inserted:,} / {SAMPLE_SIZE:,} -- done.")

    print("\nSelesai! Cek ukuran data di Atlas dashboard buat mastiin masih di bawah 512MB.")
    local_client.close()
    atlas_client.close()


if __name__ == "__main__":
    main()