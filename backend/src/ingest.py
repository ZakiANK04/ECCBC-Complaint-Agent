"""
Step 1 of the pipeline: build the RAG knowledge base.

Uses TF-IDF + cosine similarity (scikit-learn) instead of chromadb to keep
the Vercel bundle under 500 MB — chromadb alone pulls in onnxruntime (~200 MB).

Public API is identical to the chromadb version so rag_chain.py and main.py
need no changes: get_client() returns a client-like object whose
get_or_create_collection() returns a collection-like object with the same
count() / query() signatures that rag_chain.retrieve_context() already uses.
"""
import csv as _csv
import pathlib
from typing import Optional

from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.metrics.pairwise import cosine_similarity
from pypdf import PdfReader
from docx import Document as DocxDocument

BASE_DIR = pathlib.Path(__file__).resolve().parent.parent
KB_DIR = BASE_DIR / "data" / "knowledge_base"
COLLECTION_NAME = "eccbc_knowledge"

CHUNK_SIZE = 800
CHUNK_OVERLAP = 120


class _TFIDFCollection:
    """Lightweight drop-in replacement for a chromadb collection."""

    def __init__(self):
        self._vectorizer: Optional[TfidfVectorizer] = None
        self._matrix = None
        self._docs: list[str] = []

    def count(self) -> int:
        return len(self._docs)

    def query(self, query_texts: list[str], n_results: int = 4) -> dict:
        if not self._docs or self._vectorizer is None:
            return {"documents": [[]]}
        import numpy as np
        q_vec = self._vectorizer.transform([query_texts[0]])
        scores = cosine_similarity(q_vec, self._matrix)[0]
        k = min(n_results, len(self._docs))
        top_idxs = np.argsort(scores)[::-1][:k]
        results = [self._docs[i] for i in top_idxs if scores[i] > 0]
        return {"documents": [results]}

    def _build(self, docs: list[str]) -> None:
        self._docs = docs
        self._vectorizer = TfidfVectorizer(ngram_range=(1, 2), min_df=1, sublinear_tf=True)
        self._matrix = self._vectorizer.fit_transform(docs)

    def delete(self) -> None:
        self._docs = []
        self._vectorizer = None
        self._matrix = None


_collection = _TFIDFCollection()


class _FakeClient:
    """Thin wrapper so existing get_client().get_or_create_collection() calls work."""

    def get_or_create_collection(self, name: str) -> _TFIDFCollection:
        return _collection

    def delete_collection(self, name: str) -> None:
        _collection.delete()


_client = _FakeClient()


def get_client() -> _FakeClient:
    return _client


def chunk_text(text: str, size: int = CHUNK_SIZE, overlap: int = CHUNK_OVERLAP) -> list[str]:
    text = text.strip()
    if not text:
        return []
    chunks, start = [], 0
    while start < len(text):
        chunks.append(text[start:start + size])
        start += size - overlap
    return chunks


def read_any(file_path: pathlib.Path) -> str:
    suffix = file_path.suffix.lower()
    if suffix in (".txt", ".md"):
        return file_path.read_text(encoding="utf-8", errors="ignore")
    if suffix == ".pdf":
        reader = PdfReader(str(file_path))
        return "\n".join(page.extract_text() or "" for page in reader.pages)
    if suffix == ".docx":
        doc = DocxDocument(str(file_path))
        return "\n".join(p.text for p in doc.paragraphs)
    if suffix == ".csv":
        lines = []
        with open(file_path, "r", encoding="utf-8", errors="ignore") as f:
            for row in _csv.DictReader(f):
                items = [f"{k}: {v.strip()}" for k, v in row.items()
                         if v and v.strip() and v.strip().lower() != "no text provided"]
                if items:
                    lines.append(" | ".join(items))
        return "\n\n".join(lines)
    raise ValueError(f"Unsupported file type: {file_path.name}")


def build_index(client=None) -> int:
    """Rebuilds the TF-IDF collection from all files in data/knowledge_base/."""
    files = []
    for ext in ("*.txt", "*.md", "*.pdf", "*.docx", "*.csv"):
        files.extend(sorted(KB_DIR.glob(ext)))
    if not files:
        print(f"No files found in {KB_DIR}.")
        return 0

    _collection.delete()
    docs = []
    for file_path in files:
        try:
            raw = read_any(file_path)
            docs.extend(chunk_text(raw))
        except Exception:
            pass

    if docs:
        _collection._build(docs)
        print(f"Indexed {len(docs)} chunks from {len(files)} file(s) into '{COLLECTION_NAME}'.")
    return len(docs)


if __name__ == "__main__":
    build_index()
