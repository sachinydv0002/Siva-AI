
import os
import time
from pathlib import Path
from collections.abc import Iterator

from dotenv import load_dotenv
from google import genai
from google.genai.errors import APIError


BACKEND_DIR = Path(__file__).resolve().parents[1]
load_dotenv(BACKEND_DIR / ".env")

GEMINI_API_KEY = os.getenv("GEMINI_API_KEY")

if not GEMINI_API_KEY:
    raise RuntimeError(
        "GEMINI_API_KEY missing. Add it to backend/.env"
    )

client = genai.Client(api_key=GEMINI_API_KEY)

MODEL_NAME = "gemini-3.5-flash-lite"
MAX_RETRIES = 3


def get_ai_response(message: str) -> str:
    for attempt in range(MAX_RETRIES):
        try:
            start_time = time.time()

            response = client.models.generate_content(
                model=MODEL_NAME,
                contents=message,
            )

            elapsed = time.time() - start_time
            print(
                "[Performance] Gemini API response time: "
                f"{elapsed:.4f}s"
            )

            return response.text or ""

        except APIError as exc:
            if exc.code == 429 and attempt < MAX_RETRIES - 1:
                time.sleep((2 ** attempt) * 0.5)
                continue
            raise

    return ""


def stream_ai_response(message: str) -> Iterator[str]:
    for attempt in range(MAX_RETRIES):
        try:
            response_stream = client.models.generate_content_stream(
                model=MODEL_NAME,
                contents=message,
            )

            for chunk in response_stream:
                if chunk.text:
                    yield chunk.text

            return

        except APIError as exc:
            if exc.code == 429 and attempt < MAX_RETRIES - 1:
                time.sleep((2 ** attempt) * 0.5)
                continue
            raise
