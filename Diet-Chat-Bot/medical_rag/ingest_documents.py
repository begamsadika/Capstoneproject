"""Build the persistent offline medical ChromaDB from approved local sources."""

from __future__ import annotations

import argparse
import datetime as dt
import hashlib
from html import unescape
from html.parser import HTMLParser
import io
import json
import pathlib
import re
import xml.etree.ElementTree as ET
import zipfile

import chromadb
from pypdf import PdfReader

from .retriever import CHROMA_DIR, COLLECTION_NAME, _embedding_function


BASE_DIR = pathlib.Path(__file__).resolve().parent
SOURCES_DIR = BASE_DIR / "sources"
INDEX_MANIFEST = BASE_DIR / "index_manifest.json"
TOPIC_CATALOG = BASE_DIR / "topic_catalog.json"
CHUNK_SIZE = 1400
CHUNK_OVERLAP = 180


class _HTMLTextExtractor(HTMLParser):
    BLOCK_TAGS = {"p", "div", "li", "br", "h1", "h2", "h3", "h4"}

    def __init__(self) -> None:
        super().__init__(convert_charrefs=True)
        self.parts: list[str] = []

    def handle_starttag(self, tag: str, attrs) -> None:
        if tag.lower() in self.BLOCK_TAGS:
            self.parts.append("\n")

    def handle_endtag(self, tag: str) -> None:
        if tag.lower() in self.BLOCK_TAGS:
            self.parts.append("\n")

    def handle_data(self, data: str) -> None:
        self.parts.append(data)

    def text(self) -> str:
        value = unescape("".join(self.parts))
        lines = [" ".join(line.split()) for line in value.splitlines()]
        return "\n".join(line for line in lines if line)


def _clean_html(value: str) -> str:
    parser = _HTMLTextExtractor()
    parser.feed(value or "")
    parser.close()
    return parser.text()


def _local_name(tag: str) -> str:
    return tag.rsplit("}", 1)[-1]


def _first_child(element: ET.Element, name: str) -> ET.Element | None:
    for child in element.iter():
        if _local_name(child.tag) == name:
            return child
    return None


def _child_texts(element: ET.Element, name: str) -> list[str]:
    values = []
    for child in element.iter():
        if _local_name(child.tag) == name:
            value = " ".join("".join(child.itertext()).split())
            if value:
                values.append(value)
    return values


def _split_text(text: str, *, size: int = CHUNK_SIZE, overlap: int = CHUNK_OVERLAP):
    normalized = re.sub(r"[ \t]+", " ", text).strip()
    if not normalized:
        return []
    chunks = []
    start = 0
    while start < len(normalized):
        end = min(len(normalized), start + size)
        if end < len(normalized):
            paragraph = normalized.rfind("\n", start + size // 2, end)
            sentence = normalized.rfind(". ", start + size // 2, end)
            split_at = max(paragraph, sentence)
            if split_at > start:
                end = split_at + (2 if split_at == sentence else 1)
        chunk = normalized[start:end].strip()
        if chunk:
            chunks.append(chunk)
        if end >= len(normalized):
            break
        start = max(end - overlap, start + 1)
    return chunks


def _chunk_id(*parts: str) -> str:
    return hashlib.sha256("\x1f".join(parts).encode("utf-8")).hexdigest()[:32]


def _parse_medlineplus_stream(stream) -> list[dict]:
    records = []
    context = ET.iterparse(stream, events=("end",))
    for _, element in context:
        if _local_name(element.tag) != "health-topic":
            continue
        language = str(element.attrib.get("language") or "English").lower()
        if language not in {"english", "en"}:
            element.clear()
            continue
        title = str(element.attrib.get("title") or "").strip()
        source_url = str(element.attrib.get("url") or "").strip()
        topic_id = str(element.attrib.get("id") or title)
        # MedlinePlus `date-created` is the age of the topic record, not a clinical
        # review date. Only retain an explicit modification date as metadata.
        reviewed = str(element.attrib.get("date-modified") or "").strip()
        summary_element = _first_child(element, "full-summary")
        if summary_element is None or not title or not source_url:
            element.clear()
            continue
        raw_summary = "".join(summary_element.itertext())
        summary = _clean_html(raw_summary)
        if len(summary) < 120:
            element.clear()
            continue
        aliases = list(dict.fromkeys(_child_texts(element, "also-called")))[:12]
        prefix = f"Medical topic: {title}."
        if aliases:
            prefix += " Also called: " + ", ".join(aliases) + "."
        for index, chunk in enumerate(_split_text(summary)):
            text = f"{prefix}\n\n{chunk}"
            records.append(
                {
                    "id": _chunk_id("medlineplus", topic_id, str(index), text),
                    "text": text,
                    "metadata": {
                        "title": title,
                        "section": "Overview",
                        "authority": "MedlinePlus / U.S. National Library of Medicine",
                        "source_url": source_url,
                        "reviewed": reviewed,
                        "date_kind": "modified" if reviewed else "",
                        "document_type": "health_topic",
                        "jurisdiction": "United States",
                        "license": "MedlinePlus developer reuse terms",
                        "topic_id": topic_id,
                        "chunk_index": index,
                    },
                }
            )
        element.clear()
    return records


def parse_medlineplus(path: pathlib.Path) -> list[dict]:
    if path.suffix.lower() == ".zip":
        with zipfile.ZipFile(path) as archive:
            xml_names = [name for name in archive.namelist() if name.lower().endswith(".xml")]
            if not xml_names:
                raise RuntimeError(f"No XML document found inside {path}")
            with archive.open(xml_names[0]) as stream:
                return _parse_medlineplus_stream(stream)
    with path.open("rb") as stream:
        return _parse_medlineplus_stream(stream)


def parse_approved_pdf(path: pathlib.Path) -> list[dict]:
    metadata_path = path.with_suffix(".json")
    if not metadata_path.exists():
        print(f"[medical-rag] Skipping PDF without approval metadata: {path.name}")
        return []
    metadata = json.loads(metadata_path.read_text(encoding="utf-8"))
    required = {"title", "authority", "source_url", "license"}
    missing = sorted(required - metadata.keys())
    if missing:
        raise ValueError(f"{metadata_path} is missing: {', '.join(missing)}")
    reader = PdfReader(str(path))
    records = []
    for page_number, page in enumerate(reader.pages, start=1):
        page_text = "\n".join(line.strip() for line in (page.extract_text() or "").splitlines())
        for index, chunk in enumerate(_split_text(page_text)):
            text = f"Medical guideline: {metadata['title']}. Page {page_number}.\n\n{chunk}"
            records.append(
                {
                    "id": _chunk_id(path.name, str(page_number), str(index), text),
                    "text": text,
                    "metadata": {
                        "title": str(metadata["title"]),
                        "section": f"Page {page_number}",
                        "authority": str(metadata["authority"]),
                        "source_url": str(metadata["source_url"]),
                        "reviewed": str(metadata.get("reviewed") or ""),
                        "date_kind": "reviewed" if metadata.get("reviewed") else "",
                        "document_type": str(metadata.get("document_type") or "guideline"),
                        "jurisdiction": str(metadata.get("jurisdiction") or "International"),
                        "license": str(metadata["license"]),
                        "topic_id": path.stem,
                        "chunk_index": index,
                    },
                }
            )
    return records


def load_records() -> list[dict]:
    records = []
    for path in sorted((SOURCES_DIR / "medlineplus").glob("*")):
        if path.suffix.lower() in {".zip", ".xml"}:
            print(f"[medical-rag] Parsing {path.name}")
            records.extend(parse_medlineplus(path))
    for path in sorted((SOURCES_DIR / "guidelines").glob("*.pdf")):
        print(f"[medical-rag] Parsing approved guideline {path.name}")
        records.extend(parse_approved_pdf(path))
    return records


def write_topic_catalog(records: list[dict]) -> list[str]:
    topic_catalog = sorted(
        {
            str(item["metadata"].get("title") or "").strip()
            for item in records
            if str(item["metadata"].get("title") or "").strip()
        },
        key=str.casefold,
    )
    TOPIC_CATALOG.write_text(
        json.dumps(topic_catalog, indent=2, ensure_ascii=False),
        encoding="utf-8",
    )
    return topic_catalog


def build_index() -> dict:
    records = load_records()
    if not records:
        raise RuntimeError(
            "No approved source records were found. Run download_sources.py first."
        )
    CHROMA_DIR.mkdir(parents=True, exist_ok=True)
    client = chromadb.PersistentClient(path=str(CHROMA_DIR))
    names = {item.name for item in client.list_collections()}
    if COLLECTION_NAME in names:
        client.delete_collection(COLLECTION_NAME)
    collection = client.create_collection(
        name=COLLECTION_NAME,
        embedding_function=_embedding_function(),
        metadata={"hnsw:space": "cosine", "schema_version": "1"},
    )
    batch_size = 100
    for start in range(0, len(records), batch_size):
        batch = records[start : start + batch_size]
        collection.upsert(
            ids=[item["id"] for item in batch],
            documents=[item["text"] for item in batch],
            metadatas=[item["metadata"] for item in batch],
        )
        print(f"[medical-rag] Indexed {min(start + batch_size, len(records))}/{len(records)}")
    manifest = {
        "built_at_utc": dt.datetime.now(dt.timezone.utc).isoformat(),
        "collection": COLLECTION_NAME,
        "chunks": collection.count(),
        "embedding_model": "all-MiniLM-L6-v2",
        "offline_ready": True,
    }
    write_topic_catalog(records)
    INDEX_MANIFEST.write_text(json.dumps(manifest, indent=2), encoding="utf-8")
    print(f"[medical-rag] Offline index ready with {collection.count()} chunks")
    return manifest


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--catalog-only",
        action="store_true",
        help="Refresh the local medical topic-title catalog without rebuilding ChromaDB.",
    )
    args = parser.parse_args()
    if args.catalog_only:
        records = load_records()
        titles = write_topic_catalog(records)
        print(f"[medical-rag] Wrote {len(titles)} indexed topic titles")
        return
    build_index()


if __name__ == "__main__":
    main()
