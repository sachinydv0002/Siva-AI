import time
from google import genai
from google.genai.errors import APIError
from dotenv import load_dotenv
import os

load_dotenv()

client = genai.Client(
    api_key=os.getenv("GEMINI_API_KEY")
)


def get_ai_response(message: str):
    max_retries = 3
    for attempt in range(max_retries):
        try:
            start_time = time.time()
            response = client.models.generate_content(
                model="gemini-3.5-flash-lite",
                contents=message
            )
            end_time = time.time()
            print(f"[Performance] Gemini API response time: {end_time - start_time:.4f}s")
            return response.text
        except APIError as e:
            if e.code == 429 and attempt < max_retries - 1:
                time.sleep((2 ** attempt) * 0.5)
                continue
            raise e


def stream_ai_response(message: str):
    max_retries = 3
    for attempt in range(max_retries):
        try:
            response_stream = client.models.generate_content_stream(
                model="gemini-3.5-flash-lite",
                contents=message
            )

            for chunk in response_stream:
                if chunk.text:
                    yield chunk.text
            return
        except APIError as e:
            if e.code == 429 and attempt < max_retries - 1:
                time.sleep((2 ** attempt) * 0.5)
                continue
            raise e