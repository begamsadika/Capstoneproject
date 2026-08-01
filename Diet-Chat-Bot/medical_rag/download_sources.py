"""Download approved medical sources for later fully offline ingestion."""

from __future__ import annotations

import argparse
import datetime as dt
import hashlib
import json
import pathlib
import re
import urllib.parse
import urllib.request


BASE_DIR = pathlib.Path(__file__).resolve().parent
SOURCE_DIR = BASE_DIR / "sources" / "medlineplus"
MANIFEST_PATH = BASE_DIR / "sources" / "download_manifest.json"
MEDLINEPLUS_XML_PAGE = "https://medlineplus.gov/xml.html"


def _request(url: str) -> urllib.request.Request:
    return urllib.request.Request(
        url,
        headers={"User-Agent": "Wellora-Capstone-Medical-RAG/1.0"},
    )


def _latest_medlineplus_zip_url() -> str:
    with urllib.request.urlopen(_request(MEDLINEPLUS_XML_PAGE), timeout=30) as response:
        page = response.read().decode("utf-8", errors="replace")
    matches = re.findall(
        r'href=["\']([^"\']*mplus_topics_compressed_\d{4}-\d{2}-\d{2}\.zip)["\']',
        page,
        flags=re.IGNORECASE,
    )
    if not matches:
        raise RuntimeError("MedlinePlus did not publish a recognizable compressed XML link")
    return urllib.parse.urljoin(MEDLINEPLUS_XML_PAGE, matches[0])


def download_medlineplus(*, force: bool = False) -> pathlib.Path:
    SOURCE_DIR.mkdir(parents=True, exist_ok=True)
    target = SOURCE_DIR / "medlineplus_topics.zip"
    if target.exists() and not force:
        print(f"[medical-rag] Using existing {target}")
        return target

    url = _latest_medlineplus_zip_url()
    temporary = target.with_suffix(".download")
    digest = hashlib.sha256()
    size = 0
    try:
        with urllib.request.urlopen(_request(url), timeout=60) as response:
            with temporary.open("wb") as output:
                while True:
                    block = response.read(1024 * 1024)
                    if not block:
                        break
                    output.write(block)
                    digest.update(block)
                    size += len(block)
        temporary.replace(target)
    finally:
        if temporary.exists():
            temporary.unlink()

    manifest = {
        "downloaded_at_utc": dt.datetime.now(dt.timezone.utc).isoformat(),
        "sources": [
            {
                "authority": "MedlinePlus / U.S. National Library of Medicine",
                "url": url,
                "local_file": str(target.relative_to(BASE_DIR)),
                "sha256": digest.hexdigest(),
                "bytes": size,
                "reuse_note": "Attribute information to MedlinePlus.gov; do not imply endorsement.",
            }
        ],
    }
    MANIFEST_PATH.parent.mkdir(parents=True, exist_ok=True)
    MANIFEST_PATH.write_text(json.dumps(manifest, indent=2), encoding="utf-8")
    print(f"[medical-rag] Downloaded {size:,} bytes from {url}")
    return target


def cache_embedding_model() -> None:
    """Perform the one allowed online model load before offline runtime."""
    from sentence_transformers import SentenceTransformer

    SentenceTransformer("all-MiniLM-L6-v2")
    print("[medical-rag] Embedding model cached for offline use")


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--force", action="store_true", help="Replace an existing download")
    args = parser.parse_args()
    download_medlineplus(force=args.force)
    cache_embedding_model()


if __name__ == "__main__":
    main()
