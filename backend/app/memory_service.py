import json
import re
from difflib import SequenceMatcher
from datetime import datetime, timezone

from database import memories_collection
from app.ai_service import get_ai_response


def utc_now():
    return datetime.now(timezone.utc)


def _normalise(value: str) -> str:
    value = value.strip().lower()
    value = re.sub(r"[’']", "", value)
    value = re.sub(r"[^a-z0-9\\s]", " ", value)
    value = re.sub(r"\\s+", " ", value).strip()

    # Collapse common paraphrases so the same fact is not saved repeatedly.
    value = re.sub(r"^(the )?user( s)? name is ", "name ", value)
    value = re.sub(r"^(the )?users name is ", "name ", value)
    value = re.sub(r"^(my name is |i am |im )", "name ", value)
    value = re.sub(r"^(the )?user likes ", "likes ", value)
    value = re.sub(r"^(the )?user prefers ", "prefers ", value)
    return value.strip()


def _same_fact(left: str, right: str) -> bool:
    a, b = _normalise(left), _normalise(right)
    if not a or not b:
        return False
    if a == b:
        return True

    # Catch small wording differences without merging unrelated short facts.
    similarity = SequenceMatcher(None, a, b).ratio()
    a_words, b_words = set(a.split()), set(b.split())
    overlap = len(a_words & b_words) / max(1, len(a_words | b_words))
    return similarity >= 0.88 or (len(a_words | b_words) >= 4 and overlap >= 0.8)


async def get_relevant_memories(client_id: str, message: str, limit: int = 8) -> list[str]:
    """
    Return a small set of stored facts for this browser identity.
    The browser ID is an isolation aid, not secure authentication.
    """
    cursor = memories_collection.find(
        {"owner_id": client_id}
    ).sort("updated_at", -1).limit(100)

    records = [record async for record in cursor]
    if not records:
        return []

    words = {
        word for word in re.findall(r"[a-zA-Z0-9]{3,}", message.lower())
        if word not in {"what", "when", "where", "which", "with", "about", "please", "tell", "your", "from", "that", "this"}
    }

    def score(record):
        fact_words = set(re.findall(r"[a-zA-Z0-9]{3,}", record.get("fact", "").lower()))
        return len(words & fact_words)

    ranked = sorted(records, key=score, reverse=True)
    selected = [record for record in ranked if score(record) > 0][:limit]

    # If no keyword overlaps, don't inject unrelated personal facts.
    return [record["fact"] for record in selected if record.get("fact")]


async def extract_and_save_memories(client_id: str, user_message: str, assistant_reply: str) -> int:
    """
    Ask Gemini to extract only useful, durable facts from a completed exchange.
    Store each fact separately and avoid duplicate facts.
    """
    prompt = f"""
You extract long-term assistant memory from a conversation.

Save only useful, durable facts about the user, such as:
- name or stable preferences explicitly stated by the user
- ongoing projects, goals, skills, or learning preferences
- durable constraints that will help in future conversations

Do NOT save:
- one-off questions or temporary requests
- guesses, inferred sensitive traits, passwords, secrets, financial account details,
  government identifiers, or other highly sensitive personal data
- facts stated only by the assistant unless the user clearly confirmed them

Return ONLY valid JSON in this exact shape:
{{"memories": [{{"fact": "short standalone fact", "category": "profile|preference|project|goal|skill"}}]}}

Use at most 5 memories. If nothing should be saved, return {{"memories": []}}.

USER MESSAGE:
{user_message[:4000]}

ASSISTANT REPLY:
{assistant_reply[:4000]}
"""
    try:
        raw = await __import__("asyncio").to_thread(get_ai_response, prompt)
        match = re.search(r"\{.*\}", raw or "", flags=re.DOTALL)
        if not match:
            return 0
        data = json.loads(match.group(0))
        candidates = data.get("memories", [])
        if not isinstance(candidates, list):
            return 0
    except Exception as exc:
        print(f"[Memory] Extraction failed: {exc}")
        return 0

    saved = 0
    now = utc_now()

    for item in candidates[:5]:
        if not isinstance(item, dict):
            continue

        fact = re.sub(r"\s+", " ", str(item.get("fact", "")).strip())
        category = str(item.get("category", "profile")).strip().lower()

        if not fact or len(fact) > 300:
            continue
        if category not in {"profile", "preference", "project", "goal", "skill"}:
            category = "profile"

        normalised = _normalise(fact)

        # Search recent records as older versions may not have a normalized key.
        recent_cursor = memories_collection.find(
            {"owner_id": client_id}
        ).sort("updated_at", -1).limit(200)
        recent_records = [record async for record in recent_cursor]
        existing = next(
            (record for record in recent_records
             if _same_fact(fact, record.get("fact", ""))),
            None,
        )

        if existing:
            # Keep the existing wording to avoid oscillating between paraphrases.
            await memories_collection.update_one(
                {"_id": existing["_id"]},
                {"$set": {
                    "normalised_fact": _normalise(existing.get("fact", fact)),
                    "updated_at": now,
                }},
            )
        else:
            await memories_collection.insert_one({
                "owner_id": client_id,
                "fact": fact,
                "normalised_fact": normalised,
                "category": category,
                "created_at": now,
                "updated_at": now,
            })
            saved += 1

    return saved
