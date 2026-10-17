import time
from fastapi import APIRouter
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

from app.ai_service import get_ai_response, stream_ai_response

router = APIRouter()


class ChatRequest(BaseModel):
    message: str


@router.post("/chat")
def chat(request: ChatRequest):
    start_time = time.time()

    reply = get_ai_response(request.message)

    end_time = time.time()
    print(f"[Performance] Total /api/chat request time: {end_time - start_time:.4f}s")
    
    return {
        "reply": reply
    }



@router.post("/chat/stream")
def chat_stream(request: ChatRequest):
    def event_generator():
        for chunk in stream_ai_response(request.message):
            yield chunk

    return StreamingResponse(event_generator(), media_type="text/plain")