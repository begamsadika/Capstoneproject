import codecs
import json
import logging
from datetime import datetime
from typing import Optional

import httpx
from fastapi import APIRouter, Depends, HTTPException, Response, status
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session
from starlette.background import BackgroundTask

from ..core.auth import get_current_user
from ..core.config import (
    DIET_CHAT_MEMORY_SUMMARY_ENABLED,
    DIET_CHAT_SERVICE_URL,
    DIET_CHAT_STREAM_READ_TIMEOUT_SECONDS,
)
from ..database import SessionLocal, get_db
from ..models.diet_chat import DietChatConversation, DietChatMessage
from ..models.health_metric import HealthMetric
from ..models.user import User
from ..services.nutrition_log import add_diet_ai_entries


router = APIRouter(prefix="/api/diet-chat", tags=["Diet Chat"])
logger = logging.getLogger(__name__)
MAX_AI_HISTORY = 10
MAX_STORED_MESSAGES_RETURNED = 200
MIN_MESSAGES_PER_SUMMARY_UPDATE = 4
MAX_SUMMARY_BATCH_MESSAGES = 20


class DietChatRequest(BaseModel):
    message: str = Field(min_length=1, max_length=4000)
    conversation_id: Optional[int] = Field(default=None, ge=1)
    calorie_target_override: Optional[int] = Field(default=None, ge=500, le=10000)


class CreateConversationRequest(BaseModel):
    title: Optional[str] = Field(default=None, max_length=150)


def _conversation_payload(conversation: DietChatConversation) -> dict:
    return {
        "id": conversation.id,
        "title": conversation.title,
        "created_at": conversation.created_at.isoformat(),
        "updated_at": conversation.updated_at.isoformat(),
    }


def _message_payload(message: DietChatMessage) -> dict:
    return {
        "id": message.id,
        "role": message.role,
        "content": message.content,
        "created_at": message.created_at.isoformat(),
    }


def _get_owned_conversation(
    db: Session,
    conversation_id: int,
    user_id: int,
) -> DietChatConversation:
    conversation = (
        db.query(DietChatConversation)
        .filter(
            DietChatConversation.id == conversation_id,
            DietChatConversation.user_id == user_id,
        )
        .first()
    )
    if not conversation:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Conversation not found.",
        )
    return conversation


def _title_from_message(message: str) -> str:
    compact = " ".join(message.split())
    if len(compact) <= 70:
        return compact
    return f"{compact[:67].rstrip()}..."


async def _refresh_conversation_summary(
    conversation_id: int,
    user_id: int,
) -> None:
    """Summarize messages older than the recent-context window in the background."""
    summary_db = SessionLocal()
    try:
        conversation = (
            summary_db.query(DietChatConversation)
            .filter(
                DietChatConversation.id == conversation_id,
                DietChatConversation.user_id == user_id,
            )
            .first()
        )
        if not conversation:
            return

        recent_ids = [
            row[0]
            for row in (
                summary_db.query(DietChatMessage.id)
                .filter(DietChatMessage.conversation_id == conversation_id)
                .order_by(DietChatMessage.id.desc())
                .limit(MAX_AI_HISTORY)
                .all()
            )
        ]
        if len(recent_ids) < MAX_AI_HISTORY:
            return

        candidate_query = (
            summary_db.query(DietChatMessage)
            .filter(
                DietChatMessage.conversation_id == conversation_id,
                DietChatMessage.id < min(recent_ids),
            )
        )
        if conversation.summary_through_message_id is not None:
            candidate_query = candidate_query.filter(
                DietChatMessage.id > conversation.summary_through_message_id
            )

        candidates = (
            candidate_query.order_by(DietChatMessage.id.asc())
            .limit(MAX_SUMMARY_BATCH_MESSAGES)
            .all()
        )
        if len(candidates) < MIN_MESSAGES_PER_SUMMARY_UPDATE:
            return

        current_summary = conversation.summary or ""
        through_message_id = candidates[-1].id
        message_payload = [
            {"role": item.role, "content": item.content}
            for item in candidates
        ]
    except Exception:
        logger.exception(
            "Failed to prepare conversation %s for memory summarization",
            conversation_id,
        )
        return
    finally:
        summary_db.close()

    try:
        timeout = httpx.Timeout(60.0, connect=5.0)
        async with httpx.AsyncClient(timeout=timeout) as client:
            response = await client.post(
                f"{DIET_CHAT_SERVICE_URL}/chat/summarize",
                json={
                    "current_summary": current_summary,
                    "messages": message_payload,
                },
            )
            response.raise_for_status()
            refreshed_summary = response.json().get("summary", "").strip()
    except Exception:
        logger.warning(
            "Diet AI memory summarization failed for conversation %s",
            conversation_id,
            exc_info=True,
        )
        return

    if not refreshed_summary:
        return

    save_db = SessionLocal()
    try:
        conversation = (
            save_db.query(DietChatConversation)
            .filter(
                DietChatConversation.id == conversation_id,
                DietChatConversation.user_id == user_id,
            )
            .first()
        )
        if not conversation:
            return
        if (
            conversation.summary_through_message_id is not None
            and conversation.summary_through_message_id >= through_message_id
        ):
            return
        conversation.summary = refreshed_summary[:8000]
        conversation.summary_through_message_id = through_message_id
        save_db.commit()
    except Exception:
        save_db.rollback()
        logger.exception(
            "Failed to save conversation memory for conversation %s",
            conversation_id,
        )
    finally:
        save_db.close()


@router.get("/conversations")
def list_conversations(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    conversations = (
        db.query(DietChatConversation)
        .filter(DietChatConversation.user_id == current_user.id)
        .order_by(DietChatConversation.updated_at.desc())
        .limit(20)
        .all()
    )
    return [_conversation_payload(item) for item in conversations]


@router.post("/conversations", status_code=status.HTTP_201_CREATED)
def create_conversation(
    body: CreateConversationRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    title = (body.title or "").strip() or "New conversation"
    conversation = DietChatConversation(user_id=current_user.id, title=title)
    db.add(conversation)
    db.commit()
    db.refresh(conversation)
    return _conversation_payload(conversation)


@router.get("/conversations/{conversation_id}/messages")
def get_conversation_messages(
    conversation_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    conversation = _get_owned_conversation(
        db,
        conversation_id,
        current_user.id,
    )
    messages = (
        db.query(DietChatMessage)
        .filter(DietChatMessage.conversation_id == conversation.id)
        .order_by(DietChatMessage.id.desc())
        .limit(MAX_STORED_MESSAGES_RETURNED)
        .all()
    )
    messages.reverse()
    return {
        "conversation": _conversation_payload(conversation),
        "messages": [_message_payload(item) for item in messages],
    }


@router.delete(
    "/conversations/{conversation_id}",
    status_code=status.HTTP_204_NO_CONTENT,
)
def delete_conversation(
    conversation_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    conversation = _get_owned_conversation(
        db,
        conversation_id,
        current_user.id,
    )
    db.delete(conversation)
    db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


def _health_metric_payload(metric: HealthMetric) -> dict:
    """Serialize the authenticated user's trusted health context for Diet AI."""
    return {
        "height_cm": metric.height_cm,
        "weight_kg": metric.weight_kg,
        "bmi": metric.bmi,
        "bmi_category": metric.bmi_category,
        "bmr": metric.bmr,
        "maintenance_calories": metric.maintenance_calories,
        "target_calories": metric.target_calories,
        "protein_target_g": metric.protein_target_g,
        "carbs_target_g": metric.carbs_target_g,
        "fat_target_g": metric.fat_target_g,
        "health_goal": metric.health_goal,
        "activity_level": metric.activity_level,
        "dietary_preference": metric.dietary_preference,
        "allergies": metric.allergies,
        "medical_conditions": metric.medical_conditions,
        "medications": metric.medications,
        "ideal_weight_kg": metric.ideal_weight_kg,
        "weight_to_goal_kg": metric.weight_to_goal_kg,
        "estimated_weeks_to_goal": metric.estimated_weeks_to_goal,
        "calorie_deficit_surplus": metric.calorie_deficit_surplus,
    }


@router.post("/stream")
async def stream_diet_chat(
    body: DietChatRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Authenticate the user and relay the internal Diet AI SSE stream."""
    current_user_id = int(current_user.id)
    current_user_name = current_user.name
    metric = (
        db.query(HealthMetric)
        .filter(HealthMetric.user_id == current_user_id)
        .first()
    )
    if not metric:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Health profile not found. Please complete onboarding first.",
        )

    message_text = body.message.strip()
    if not message_text:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Message cannot be empty.",
        )

    if body.conversation_id is None:
        conversation = DietChatConversation(
            user_id=current_user_id,
            title=_title_from_message(message_text),
        )
        db.add(conversation)
        db.flush()
    else:
        conversation = _get_owned_conversation(
            db,
            body.conversation_id,
            current_user_id,
        )

    prior_messages = (
        db.query(DietChatMessage)
        .filter(DietChatMessage.conversation_id == conversation.id)
        .order_by(DietChatMessage.id.desc())
        .limit(MAX_AI_HISTORY)
        .all()
    )
    prior_messages.reverse()

    upstream_payload = {
        "user_id": current_user_id,
        "message": message_text,
        "history": [
            {"role": item.role, "content": item.content}
            for item in prior_messages
        ],
        "conversation_summary": conversation.summary,
        "user_metrics": _health_metric_payload(metric),
        "calorie_target_override": body.calorie_target_override,
        "user_name": current_user_name,
    }

    # Persist the user message and release the request-scoped connection before
    # opening the potentially long Diet AI stream. Otherwise each active stream
    # can occupy one pool slot until the entire response and background task end.
    if conversation.title == "New conversation":
        conversation.title = _title_from_message(message_text)
    conversation.updated_at = datetime.utcnow()
    db.add(
        DietChatMessage(
            conversation_id=conversation.id,
            role="user",
            content=message_text,
        )
    )
    db.commit()
    conversation_id = int(conversation.id)
    db.close()

    timeout = httpx.Timeout(
        30.0,
        connect=5.0,
        read=DIET_CHAT_STREAM_READ_TIMEOUT_SECONDS,
    )
    client = httpx.AsyncClient(timeout=timeout)
    try:
        request = client.build_request(
            "POST",
            f"{DIET_CHAT_SERVICE_URL}/chat/stream",
            json=upstream_payload,
            headers={"Accept": "text/event-stream"},
        )
        upstream = await client.send(request, stream=True)
    except httpx.RequestError as exc:
        await client.aclose()
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Diet AI service is currently unavailable.",
        ) from exc

    if upstream.status_code >= 400:
        await upstream.aread()
        await upstream.aclose()
        await client.aclose()
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="Diet AI service could not process the request.",
        )

    async def relay_stream():
        decoder = codecs.getincrementaldecoder("utf-8")()
        event_buffer = ""
        assistant_parts: list[str] = []
        meal_log_entries: list[dict] = []
        try:
            async for chunk in upstream.aiter_raw():
                event_buffer += decoder.decode(chunk)
                lines = event_buffer.split("\n")
                event_buffer = lines.pop()
                for line in lines:
                    line = line.rstrip("\r")
                    if not line.startswith("data:"):
                        continue
                    payload = line[5:].strip()
                    if not payload or payload == "[DONE]":
                        continue
                    try:
                        event = json.loads(payload)
                    except json.JSONDecodeError:
                        continue
                    token = event.get("token")
                    if isinstance(token, str):
                        assistant_parts.append(token)
                    entries = event.get("meal_log_entries")
                    if isinstance(entries, list):
                        meal_log_entries.extend(
                            entry for entry in entries if isinstance(entry, dict)
                        )
                yield chunk
        except httpx.RequestError as exc:
            logger.warning("Diet AI upstream stream stopped: %s", exc)
            fallback = (
                "\n\n**Diet AI is taking longer than expected.** "
                "The request was stopped so you would not have to wait indefinitely. "
                "Please retry your question."
                if assistant_parts
                else "**Diet AI is taking longer than expected.**\n\n"
                "The request was stopped so you would not have to wait indefinitely. "
                "Please retry your question."
            )
            assistant_parts.append(fallback)
            yield f"data: {json.dumps({'token': fallback})}\n\n".encode("utf-8")
            yield b"data: [DONE]\n\n"
        finally:
            await upstream.aclose()
            await client.aclose()

            assistant_text = "".join(assistant_parts).strip()
            if assistant_text or meal_log_entries:
                save_db = SessionLocal()
                try:
                    saved_conversation = (
                        save_db.query(DietChatConversation)
                        .filter(
                            DietChatConversation.id == conversation_id,
                            DietChatConversation.user_id == current_user_id,
                        )
                        .first()
                    )
                    if saved_conversation:
                        saved_conversation.updated_at = datetime.utcnow()
                        if assistant_text:
                            save_db.add(
                                DietChatMessage(
                                    conversation_id=conversation_id,
                                    role="assistant",
                                    content=assistant_text,
                                )
                            )
                        if meal_log_entries:
                            add_diet_ai_entries(
                                save_db,
                                current_user_id,
                                meal_log_entries,
                            )
                        save_db.commit()
                except Exception:
                    save_db.rollback()
                    logger.exception(
                        "Failed to persist Diet AI response for conversation %s",
                        conversation_id,
                    )
                finally:
                    save_db.close()

    return StreamingResponse(
        relay_stream(),
        media_type="text/event-stream",
        background=(
            BackgroundTask(
                _refresh_conversation_summary,
                conversation_id,
                current_user_id,
            )
            if DIET_CHAT_MEMORY_SUMMARY_ENABLED
            else None
        ),
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",
            "X-Conversation-Id": str(conversation_id),
        },
    )
