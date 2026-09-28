"""
Step 1 of the pipeline: build the RAG knowledge base.

Reads every .txt/.md file in data/knowledge_base/, splits it into
overlapping chunks, and upserts them into a local, persistent Chroma
collection. Run this once at the start, and again any time you add or
change a document in data/knowledge_base/.

Usage:
    python -m src.ingest
"""
import pathlib
import chromadb
from pypdf import PdfReader
from docx import Document as DocxDocument

BASE_DIR = pathlib.Path(__file__).resolve().parent.parent
KB_DIR = BASE_DIR / "data" / "knowledge_base"
CHROMA_DIR = BASE_DIR / "data" / "chroma_store"
COLLECTION_NAME = "eccbc_knowledge"

CHUNK_SIZE = 800       # characters per chunk — small enough for precise retrieval
CHUNK_OVERLAP = 120    # keeps context from being cut mid-idea


def chunk_text(text: str, size: int = CHUNK_SIZE, overlap: int = CHUNK_OVERLAP):
    """Naive fixed-size character chunker with overlap. Good enough for a
    15-day prototype; swap for a sentence/paragraph-aware splitter later
    if retrieval quality needs improving."""
    text = text.strip()
    if not text:
        return []
    chunks = []
    start = 0
    while start < len(text):
        end = start + size
        chunks.append(text[start:end])
        start += size - overlap
    return chunks


def read_any(file_path: pathlib.Path) -> str:
    """Extracts plain text from .txt, .md, .pdf, or .docx files, so real
    ECCBC documents (usually PDF or Word, not plain text) can be dropped
    in as-is without manual conversion."""
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
        import csv
        lines = []
        with open(file_path, "r", encoding="utf-8", errors="ignore") as f:
            reader = csv.DictReader(f)
            for row in reader:
                items = [f"{k}: {v.strip()}" for k, v in row.items() if v and v.strip() and v.strip().lower() != "no text provided"]
                if items:
                    lines.append(" | ".join(items))
        return "\n\n".join(lines)
    raise ValueError(f"Unsupported file type: {file_path.name}")


def get_client() -> chromadb.ClientAPI:
    return chromadb.PersistentClient(path=str(CHROMA_DIR))


def build_index() -> int:
    """Rebuilds the collection from scratch and returns the number of
    chunks indexed."""
    client = get_client()
    # Start clean each run so edits/removals in knowledge_base are reflected.
    try:
        client.delete_collection(COLLECTION_NAME)
    except Exception:
        pass
    collection = client.get_or_create_collection(COLLECTION_NAME)

    files = []
    for ext in ("*.txt", "*.md", "*.pdf", "*.docx", "*.csv"):
        files.extend(sorted(KB_DIR.glob(ext)))
    if not files:
        print(f"No .txt/.md/.pdf/.docx files found in {KB_DIR}. Add ECCBC documents there first.")
        return 0

    ids, docs, metas = [], [], []
    for file_path in files:
        raw = read_any(file_path)
        for i, chunk in enumerate(chunk_text(raw)):
            ids.append(f"{file_path.stem}-{i}")
            docs.append(chunk)
            metas.append({"source": file_path.name, "chunk_index": i})

    if docs:
        collection.add(ids=ids, documents=docs, metadatas=metas)
    print(f"Indexed {len(docs)} chunks from {len(files)} file(s) into '{COLLECTION_NAME}'.")
    return len(docs)


if __name__ == "__main__":
    build_index()
