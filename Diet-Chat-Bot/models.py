"""
models.py — Pydantic request/response models for the FastAPI endpoints.
"""
from typing import List, Optional
from pydantic import BaseModel


class Message(BaseModel):
    role: str
    content: str


class ChatRequest(BaseModel):
    message: str
    history: List[Message] = []
    user_metrics: Optional[dict] = None
    calorie_target_override: Optional[int] = None  # set by frontend after a weight goal calculation
    user_name: Optional[str] = None


class ChatResponse(BaseModel):
    reply: str
