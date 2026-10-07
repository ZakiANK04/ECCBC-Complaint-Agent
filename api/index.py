"""
Vercel Python serverless entry point.
Adds the backend directory to sys.path and re-exports the FastAPI ASGI app.
Vercel's Python runtime detects the `app` variable and serves it as ASGI.
"""
import sys
import os

sys.path.insert(0, os.path.join(os.path.dirname(os.path.dirname(__file__)), "backend"))

from main import app  # noqa: F401  – Vercel picks up `app` as the ASGI handler
