
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from database import client

from app.chat import router as chat_router

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "https://siva-ai-one.vercel.app",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(chat_router, prefix="/api")


@app.get("/")
def home():
    return {
        "message": "Siva AI Backend is running"
    }


@app.get("/test-db")
async def test_db():
    await client.admin.command("ping")
    return {"message": "MongoDB connected successfully"}
