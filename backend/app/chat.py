import asyncio
import queue
import threading
import time
from datetime import datetime, timezone
from typing import Literal

from fastapi import APIRouter, Header, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field
from bson import ObjectId

from datetime import datetime, timezone, timedelta

from database import chats_collection, messages_collection, memories_collection
from app.ai_service import get_ai_response, stream_ai_response
from app.memory_service import get_relevant_memories, extract_and_save_memories

router = APIRouter()


def utc_now():
    return datetime.now(timezone.utc)


def require_client_id(
    x_client_id: str = Header(..., alias="X-Client-ID")
) -> str:
    client_id = x_client_id.strip()
    if not client_id or len(client_id) > 128:
        raise HTTPException(
            status_code=400,
            detail="Invalid X-Client-ID header",
        )
    return client_id


class ChatRequest(BaseModel):
    message: str = Field(min_length=1, max_length=100000)
    chat_id: str = Field(min_length=1, max_length=128)
    mode: Literal["chat", "beu", "interview"] = "chat"


class CreateChatRequest(BaseModel):
    id: str = Field(min_length=1, max_length=128)
    title: str = Field(default="New chat", max_length=80)
    mode: Literal["chat", "beu", "interview"] = "chat"


class ImportMessage(BaseModel):
    sender: Literal["user", "ai"]
    text: str = Field(max_length=100000)
    createdAt: int | None = None


class ImportChat(BaseModel):
    id: str = Field(min_length=1, max_length=128)
    title: str = Field(default="New chat", max_length=80)
    mode: Literal["chat", "beu", "interview"] = "chat"
    pinned: bool = False
    updatedAt: int | None = None
    messages: list[ImportMessage] = Field(default_factory=list, max_length=1000)


class ImportRequest(BaseModel):
    chats: list[ImportChat] = Field(default_factory=list, max_length=200)


class ChatMetadataUpdate(BaseModel):
    title: str | None = Field(default=None, max_length=80)
    pinned: bool | None = None
    mode: Literal["chat", "beu", "interview"] | None = None


def serialize_chat(chat):
    return {
        "id": chat["_id"],
        "title": chat.get("title", "New chat"),
        "mode": chat.get("mode", "chat"),
        "pinned": bool(chat.get("pinned", False)),
        "createdAt": chat.get("created_at", utc_now()).timestamp() * 1000,
        "updatedAt": chat.get("updated_at", utc_now()).timestamp() * 1000,
    }


async def ensure_chat(client_id, chat_id, message, mode="chat"):
    now = utc_now()
    title = message.strip().replace("\n", " ")
    title = title[:36] + ("…" if len(title) > 36 else "")

    await chats_collection.update_one(
        {"_id": chat_id, "owner_id": client_id},
        {
            "$setOnInsert": {
                "_id": chat_id,
                "owner_id": client_id,
                "title": title or "New chat",
                "mode": mode,
                "pinned": False,
                "created_at": now,
            },
            "$set": {"updated_at": now},
        },
        upsert=True,
    )


@router.post("/chats")
async def create_chat(
    request: CreateChatRequest,
    client_id: str = Header(..., alias="X-Client-ID"),
):
    client_id = require_client_id(client_id)
    now = utc_now()
    await chats_collection.update_one(
        {"_id": request.id, "owner_id": client_id},
        {
            "$setOnInsert": {
                "_id": request.id,
                "owner_id": client_id,
                "title": request.title,
                "mode": request.mode,
                "pinned": False,
                "created_at": now,
                "updated_at": now,
            }
        },
        upsert=True,
    )
    return {"ok": True, "id": request.id}


@router.get("/chats")
async def list_chats(
    client_id: str = Header(..., alias="X-Client-ID"),
):
    client_id = require_client_id(client_id)
    cursor = chats_collection.find(
        {"owner_id": client_id}
    ).sort([("pinned", -1), ("updated_at", -1)])
    return {"chats": [serialize_chat(chat) async for chat in cursor]}


@router.get("/chats/{chat_id}/messages")
async def list_messages(
    chat_id: str,
    client_id: str = Header(..., alias="X-Client-ID"),
):
    client_id = require_client_id(client_id)
    chat = await chats_collection.find_one({
        "_id": chat_id,
        "owner_id": client_id,
    })
    if not chat:
        raise HTTPException(status_code=404, detail="Chat not found")

    cursor = messages_collection.find({
        "chat_id": chat_id,
        "owner_id": client_id,
    }).sort([("created_at", 1), ("_id", 1)])

    messages = []
    async for item in cursor:
        messages.append({
            "id": str(item.get("_id", "")),
            "sender": "user" if item.get("role") == "user" else "ai",
            "text": item.get("content", ""),
            "createdAt": item.get("created_at", utc_now()).timestamp() * 1000,
        })
    return {"messages": messages}


@router.patch("/chats/{chat_id}")
async def update_chat(
    chat_id: str,
    update: ChatMetadataUpdate,
    client_id: str = Header(..., alias="X-Client-ID"),
):
    client_id = require_client_id(client_id)
    changes = update.model_dump(exclude_none=True)
    if "title" in changes:
        changes["title"] = changes["title"].strip()
        if not changes["title"]:
            raise HTTPException(status_code=400, detail="Chat title cannot be empty")
    if not changes:
        raise HTTPException(status_code=400, detail="No changes supplied")

    changes["updated_at"] = utc_now()
    result = await chats_collection.update_one(
        {"_id": chat_id, "owner_id": client_id},
        {"$set": changes},
    )
    if not result.matched_count:
        raise HTTPException(status_code=404, detail="Chat not found")
    return {"ok": True}


@router.delete("/chats/{chat_id}")
async def delete_chat(
    chat_id: str,
    client_id: str = Header(..., alias="X-Client-ID"),
):
    client_id = require_client_id(client_id)
    result = await chats_collection.delete_one({
        "_id": chat_id,
        "owner_id": client_id,
    })
    if not result.deleted_count:
        raise HTTPException(status_code=404, detail="Chat not found")

    await messages_collection.delete_many({
        "chat_id": chat_id,
        "owner_id": client_id,
    })
    return {"ok": True}


@router.post("/chats/import")
async def import_local_history(
    request: ImportRequest,
    client_id: str = Header(..., alias="X-Client-ID"),
):
    client_id = require_client_id(client_id)

    if await chats_collection.count_documents({"owner_id": client_id}, limit=1):
        return {"imported": 0, "skipped": True}

    imported = 0
    for chat in request.chats:
        now = utc_now()
        updated = (
            datetime.fromtimestamp(chat.updatedAt / 1000, timezone.utc)
            if chat.updatedAt else now
        )
        await chats_collection.update_one(
            {"_id": chat.id, "owner_id": client_id},
            {
                "$setOnInsert": {
                    "_id": chat.id,
                    "owner_id": client_id,
                    "title": chat.title,
                    "mode": chat.mode,
                    "pinned": chat.pinned,
                    "created_at": now,
                    "updated_at": updated,
                }
            },
            upsert=True,
        )

        existing = await messages_collection.count_documents(
            {"owner_id": client_id, "chat_id": chat.id}, limit=1
        )
        if chat.messages and not existing:
            documents = []
            for message in chat.messages:
                created = (
                    datetime.fromtimestamp(message.createdAt / 1000, timezone.utc)
                    if message.createdAt else now
                )
                documents.append({
                    "owner_id": client_id,
                    "chat_id": chat.id,
                    "role": "user" if message.sender == "user" else "assistant",
                    "content": message.text,
                    "created_at": created,
                })
            if documents:
                await messages_collection.insert_many(documents)
        imported += 1

    return {"imported": imported, "skipped": False}


async def save_user_message(client_id, chat_id, message):
    await messages_collection.insert_one({
        "owner_id": client_id,
        "chat_id": chat_id,
        "role": "user",
        "content": message,
        "created_at": utc_now(),
    })


async def save_assistant_message(client_id, chat_id, message):
    now = utc_now()
    await messages_collection.insert_one({
        "owner_id": client_id,
        "chat_id": chat_id,
        "role": "assistant",
        "content": message,
        "created_at": now,
    })
    await chats_collection.update_one(
        {"_id": chat_id, "owner_id": client_id},
        {"$set": {"updated_at": now}},
    )






async def build_context(client_id, chat_id, message):
    # 1. Fetch recent chat history
    cursor = messages_collection.find({
        "owner_id": client_id,
        "chat_id": chat_id,
    }).sort([
        ("created_at", -1),
        ("_id", -1),
    ]).limit(20)

    history = [item async for item in cursor]
    history.reverse()

    # 2. Current date and time (IST)
    current_time = datetime.now(timezone.utc).astimezone(
        timezone(timedelta(hours=5, minutes=30))
    )

    parts = [
        f"Current date and time (IST): "
        f"{current_time.strftime('%A, %d %B %Y, %I:%M %p')}. "
        "Use this for current-date questions."
    ]

    # 3. Detect creator-related questions
    msg = message.lower().strip()

    creator_keywords = (
        "sachin", "creator", "developer", "developed you",
        "who created", "who built you", "your owner",
        "tumhe kisne", "kisne banaya", "banaya kisne",
        "tumhara creator", "tumhare developer", "founder",
        "portfolio", "github", "linkedin", "leetcode",
        "instagram", "youtube", "email", "contact details",
        "projects", "project", "kya banaya", "kya bnaya",
        "kya banaye", "skills", "what has he built",
        "what has he created", "about him", "about sachin",
        "usne kya", "unhone kya", "unki profile",
        "social profile", "social media",
    )

    # 4. Add only relevant creator information
    if any(keyword in msg for keyword in creator_keywords):
        creator_context = """
CREATOR PROFILE — SACHIN YADAV

Sachin Yadav is the developer of Siva AI.
Professional focus: Full-Stack Development, Backend Engineering,
Software Development, Artificial Intelligence and Data Analytics.

Technical expertise:
Python, React, FastAPI, Gemini API and MongoDB.

Known projects:
- Siva AI: AI assistant.
- DriveX: Cloud file storage project similar to Google Drive.
- ByteBazaar: E-commerce website.
- Data Analytics: IPL and sales analytics projects.

Public profiles:
GitHub: https://github.com/sachinydv0002/
LinkedIn: https://www.linkedin.com/in/sachinydv0002/
LeetCode: https://leetcode.com/u/sachinydv0002/
Portfolio: https://sachin-portfolio-navy.vercel.app/
Instagram: https://www.instagram.com/sachinydv0002_/
YouTube: https://www.youtube.com/@Sachinydv0002-sde
Email: sachincseiot@gmail.com

RESPONSE RULES:
- Answer the exact question first; keep the response natural.
- If asked who developed Siva AI, say Sachin Yadav is its developer.
  Briefly mention his professional role, then ask if the user
  would like to know more about him.
- If asked what he does, describe his development focus and
  relevant technical expertise.
- If asked about his work or projects, explain relevant projects
  conversationally instead of replying with links alone.
- If asked for one profile, share only that profile.
- Share all profiles only when explicitly requested.
- You may mention the portfolio or GitHub when discussing projects,
  but do not force links into every answer.
- Do not invent education, employment history, achievements,
  or unconfirmed project features.
- Do not mention the creator in unrelated conversations.
- Avoid repeating the same introduction in follow-up messages.
"""
        parts.append(creator_context)

    # 4.5. Detect BEU and Interview-related questions
    interview_keywords = (
        "interview preparation", "interview questions",
        "mock interview", "job interview", "hr interview",
        "technical interview", "interview practice",
        "interview round", "interview tips",
        "interview ki tayari", "interview ki taiyari",
        "interview ke questions", "interview ki preparation",
        "placement preparation",
    )

    beu_keywords = (
        "beu", "bihar engineering university",
        "b.tech cse semester", "btech cse semester",
        "b.tech semester", "btech semester","btech",
        "semester syllabus", "semester exam",
        "semester notes", "semester question paper",
        "semester pyq", "university syllabus","sem","semester",
        "1st semester", "2nd semester", "3rd semester",
        "4th semester", "5th semester", "6th semester",
        "7th semester", "8th semester",
        "first semester", "second semester",
        "third semester", "fourth semester",
        "fifth semester", "sixth semester",
        "seventh semester", "eighth semester",
    )

    if any(keyword in msg for keyword in interview_keywords):
        parts.append("""
MODE GUIDANCE:
This appears to be an interview-preparation question.
Politely ask the user to switch to Interview Mode for focused
interview preparation. Keep the response brief and do not answer
the full interview question in Normal Mode.
""")

    elif any(keyword in msg for keyword in beu_keywords):
        parts.append("""
MODE GUIDANCE:
This appears to be a BEU B.Tech CSE semester-related question.
Politely ask the user to switch to BEU Mode for focused,
semester-specific assistance. Keep the response brief and do not
answer the full university-specific question in Normal Mode.
""")

    # 5. Add recent conversation history
    for item in history:
        role = "User" if item["role"] == "user" else "Assistant"
        parts.append(f'{role}: {item["content"]}')

    # 6. Add relevant saved memories
    memories = await get_relevant_memories(client_id, message)

    if memories:
        memory_block = "\n".join(
            f"- {fact}" for fact in memories
        )
        parts.append(
            "Relevant saved memories about the user "
            "(use only when helpful; do not assume uncertain facts):\n"
            + memory_block
        )

    # 7. Add current message
    parts.append(f"User: {message}")

    return "\n\n".join(parts)




async def save_exchange_memory(client_id, user_message, assistant_reply):
    try:
        count = await extract_and_save_memories(
            client_id, user_message, assistant_reply
        )
        if count:
            print(f"[Memory] Saved {count} new memory fact(s).")
    except Exception as exc:
        # Memory failure must never break the chat response.
        print(f"[Memory] Save failed: {exc}")


@router.get("/memories")
async def list_memories(
    client_id: str = Header(..., alias="X-Client-ID"),
):
    """List saved facts for this browser identity."""
    client_id = require_client_id(client_id)
    cursor = memories_collection.find(
        {"owner_id": client_id}
    ).sort("updated_at", -1).limit(200)

    memories = []
    async for item in cursor:
        memories.append({
            "id": str(item["_id"]),
            "fact": item.get("fact", ""),
            "category": item.get("category", "profile"),
            "updatedAt": item.get("updated_at", utc_now()).timestamp() * 1000,
        })

    return {"memories": memories}


@router.delete("/memories/{memory_id}")
async def delete_memory(
    memory_id: str,
    client_id: str = Header(..., alias="X-Client-ID"),
):
    """Delete one memory belonging to this browser identity."""
    client_id = require_client_id(client_id)

    try:
        object_id = ObjectId(memory_id)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid memory ID")

    result = await memories_collection.delete_one({
        "_id": object_id,
        "owner_id": client_id,
    })

    if not result.deleted_count:
        raise HTTPException(status_code=404, detail="Memory not found")

    return {"ok": True}


@router.post("/chat")
async def chat(
    request: ChatRequest,
    client_id: str = Header(..., alias="X-Client-ID"),
):
    client_id = require_client_id(client_id)
    message = request.message.strip()
    if not message:
        raise HTTPException(status_code=400, detail="Message cannot be empty")

    start = time.time()
    await ensure_chat(client_id, request.chat_id, message, request.mode)
    context = await build_context(client_id, request.chat_id, message)
    await save_user_message(client_id, request.chat_id, message)

    reply = await asyncio.to_thread(get_ai_response, context)
    await save_assistant_message(client_id, request.chat_id, reply)
    await save_exchange_memory(client_id, message, reply)

    print(
        f"[Performance] Total /api/chat request time: "
        f"{time.time() - start:.4f}s"
    )
    return {"reply": reply}


@router.post("/chat/stream")
async def chat_stream(
    request: ChatRequest,
    client_id: str = Header(..., alias="X-Client-ID"),
):
    client_id = require_client_id(client_id)
    message = request.message.strip()
    if not message:
        raise HTTPException(status_code=400, detail="Message cannot be empty")

    await ensure_chat(client_id, request.chat_id, message, request.mode)
    context = await build_context(client_id, request.chat_id, message)
    await save_user_message(client_id, request.chat_id, message)

    async def event_generator():
        chunks = queue.Queue()
        response_parts = []
        failed = False

        def produce():
            try:
                for chunk in stream_ai_response(context):
                    chunks.put(("chunk", chunk))
            except Exception as exc:
                chunks.put(("error", str(exc)))
            finally:
                chunks.put(("done", None))

        threading.Thread(target=produce, daemon=True).start()

        while True:
            kind, value = await asyncio.to_thread(chunks.get)
            if kind == "chunk":
                response_parts.append(value)
                yield value
            elif kind == "error":
                failed = True
                print(f"[Streaming error] {value}")
                yield "\n\n**Unable to get a response. Please try again.**"
            else:
                break

        reply = "".join(response_parts)
        if reply and not failed:
            await save_assistant_message(client_id, request.chat_id, reply)
            await save_exchange_memory(client_id, message, reply)

    return StreamingResponse(
        event_generator(),
        media_type="text/plain; charset=utf-8",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",
        },
    )


