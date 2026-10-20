
import os
from pathlib import Path

from dotenv import load_dotenv
from motor.motor_asyncio import AsyncIOMotorClient

BACKEND_DIR = Path(__file__).resolve().parent
load_dotenv(BACKEND_DIR / ".env")

MONGO_URI = os.getenv("MONGO_URI")

if not MONGO_URI:
    raise RuntimeError(
        "MONGO_URI missing. Add it to backend/.env"
    )

client = AsyncIOMotorClient(MONGO_URI)

db = client["siva_ai"]

chats_collection = db["chats"]
messages_collection = db["messages"]
memories_collection = db["memories"]
