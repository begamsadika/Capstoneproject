"""
models.py — Pydantic request/response models for the FastAPI endpoints.
"""
from typing import List, Optional
from pydantic import BaseModel, Field


class Message(BaseModel):
    role: str
    content: str


class ChatRequest(BaseModel):
    user_id: int = Field(gt=0)
    message: str
    history: List[Message] = Field(default_factory=list)
    conversation_summary: Optional[str] = Field(default=None, max_length=8000)
    user_metrics: Optional[dict] = None
    calorie_target_override: Optional[int] = None  # set by frontend after a weight goal calculation
    user_name: Optional[str] = None


class ChatResponse(BaseModel):
    reply: str


class ConversationSummaryRequest(BaseModel):
    current_summary: Optional[str] = Field(default=None, max_length=8000)
    messages: List[Message] = Field(min_length=1, max_length=30)


class ConversationSummaryResponse(BaseModel):
    summary: str
