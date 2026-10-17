from google import genai
from dotenv import load_dotenv
import os

load_dotenv()

client = genai.Client(
    api_key=os.getenv("GEMINI_API_KEY")
)


def get_ai_response(message: str):
    response = client.models.generate_content(
        model="gemini-3.5-flash-lite",
        contents=message
    )

    return response.text


def stream_ai_response(message: str):

    response_stream = client.models.generate_content_stream(
        model="gemini-3.5-flash-lite",
        contents=message
    )

    for chunk in response_stream:
        if chunk.text:
            yield chunk.text