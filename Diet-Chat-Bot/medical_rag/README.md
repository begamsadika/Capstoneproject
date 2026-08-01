# Wellora Offline Medical RAG

The runtime never downloads medical documents. Download and indexing are explicit
maintenance operations performed while online; chat retrieval uses only the local
ChromaDB and the already cached embedding model.

## Build the MedlinePlus index

From `Diet-Chat-Bot`:

```powershell
python -m medical_rag.download_sources
python -m medical_rag.ingest_documents
```

The download command also caches `all-MiniLM-L6-v2`. Runtime retrieval loads it
with `local_files_only=True`, so a chat request never probes Hugging Face.

MedlinePlus requires attribution and must not be presented as endorsing Wellora.
The generated answer therefore retains the source title, authority, URL and date.

## Add an approved PDF guideline

Place the PDF under `medical_rag/sources/guidelines/` and add a same-name JSON file:

```json
{
  "title": "Guideline title",
  "authority": "Publishing authority",
  "source_url": "https://official.example/guideline.pdf",
  "license": "Verified reuse terms",
  "reviewed": "2026",
  "jurisdiction": "Sri Lanka",
  "document_type": "clinical_guideline"
}
```

PDFs without this approval metadata are deliberately skipped. Re-run ingestion after
adding or updating sources.

## Runtime behavior

- Disease-information questions search the local medical index.
- Low-confidence retrieval abstains instead of asking the LLM to invent an answer.
- Gemini is used online and Ollama offline, but both receive the same retrieved evidence.
- Citations are generated deterministically after the model response.

## Evaluate it independently

Run all 50 questions with generated answers (Gemini online, Ollama offline):

```powershell
python -m component_tests.evaluate_medical_rag
```

To test only routing and retrieval without waiting for an LLM:

```powershell
python -m component_tests.evaluate_medical_rag --retrieval-only
```

Each question is printed in the terminal. The complete result—including retrieved
context, similarity distance, generated answer, provider, citations and timing—is
stored in `evaluation_outputs/medical_rag_results.json`.
