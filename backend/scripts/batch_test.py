"""
Run the classifier + reply pipeline against a batch of real (or sample)
complaints stored in a CSV, and write the results to another CSV for
review with your supervisor/commercial team — this is what Week 2, Day 6
in the README ("wire classify.py against 10-15 real sample complaints")
actually runs.

Input CSV: one column, header "complaint_text" (extra columns are kept
and passed through untouched).

Usage:
    python -m scripts.batch_test data/sample_complaints.csv data/batch_results.csv
"""
import csv
import os
import sys
import pathlib

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent.parent))

from dotenv import load_dotenv
from google import genai

from src.classify import classify_complaint
from src.rag_chain import retrieve_context, generate_client_reply
from src.ingest import get_client as get_chroma_client, COLLECTION_NAME

load_dotenv()


def main(input_csv: str, output_csv: str) -> None:
    api_key = os.getenv("GOOGLE_API_KEY")
    if not api_key:
        raise SystemExit("Set GOOGLE_API_KEY in .env first.")

    client = genai.Client(api_key=api_key)
    collection = get_chroma_client().get_or_create_collection(COLLECTION_NAME)

    with open(input_csv, newline="", encoding="utf-8") as f:
        rows = list(csv.DictReader(f))

    if not rows:
        print(f"No rows found in {input_csv}.")
        return

    fieldnames = list(rows[0].keys()) + [
        "problem_type", "department", "sentiment", "urgency", "summary", "client_reply",
    ]
    with open(output_csv, "w", newline="", encoding="utf-8") as out:
        writer = csv.DictWriter(out, fieldnames=fieldnames)
        writer.writeheader()
        for i, row in enumerate(rows, 1):
            text = row["complaint_text"]
            print(f"[{i}/{len(rows)}] classifying: {text[:60]}...")
            classification = classify_complaint(client, text)
            context_chunks = retrieve_context(collection, text)
            reply = generate_client_reply(client, text, context_chunks)
            row.update(
                problem_type=classification.problem_type,
                department=classification.department,
                sentiment=classification.sentiment,
                urgency=classification.urgency,
                summary=classification.summary,
                client_reply=reply,
            )
            writer.writerow(row)

    print(f"Done. Results written to {output_csv}")


if __name__ == "__main__":
    if len(sys.argv) != 3:
        print("Usage: python -m scripts.batch_test <input_csv> <output_csv>")
        raise SystemExit(1)
    main(sys.argv[1], sys.argv[2])
