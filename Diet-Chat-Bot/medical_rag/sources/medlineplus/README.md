# MedlinePlus snapshot

Run `python -m medical_rag.download_sources` while online to download the current
official MedlinePlus XML snapshot, then run `python -m medical_rag.ingest_documents`
to rebuild the local index. Generated XML/ZIP files are intentionally not tracked.
