
import os

from dotenv import load_dotenv
from motor.motor_asyncio import AsyncIOMotorClient

load_dotenv()

MONGO_URI = os.getenv("MONGO_URI")

if not MONGO_URI:
    raise RuntimeError(
        "MONGO_URI missing. Add it to backend/.env"
    )

client = AsyncIOMotorClient(MONGO_URI)

db = client["siva_ai"]

# Chat history
chats_collection = db["chats"]
messages_collection = db["messages"]

# Long-term chat memory
memories_collection = db["memories"]
