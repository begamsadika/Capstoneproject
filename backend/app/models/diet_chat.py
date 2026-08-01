from datetime import datetime

from sqlalchemy import Column, DateTime, ForeignKey, Integer, String, Unicode, UnicodeText
from sqlalchemy.orm import relationship

from ..database import Base


class DietChatConversation(Base):
    __tablename__ = "Wellora_DietChatConversations"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(
        Integer,
        ForeignKey("Wellora_Users.id"),
        nullable=False,
        index=True,
    )
    title = Column(Unicode(150), nullable=False, default="New conversation")
    summary = Column(UnicodeText, nullable=True)
    summary_through_message_id = Column(Integer, nullable=True)
    created_at = Column(DateTime, nullable=False, default=datetime.utcnow)
    updated_at = Column(
        DateTime,
        nullable=False,
        default=datetime.utcnow,
        onupdate=datetime.utcnow,
    )

    messages = relationship(
        "DietChatMessage",
        back_populates="conversation",
        cascade="all, delete-orphan",
        order_by="DietChatMessage.id",
    )


class DietChatMessage(Base):
    __tablename__ = "Wellora_DietChatMessages"

    id = Column(Integer, primary_key=True, index=True)
    conversation_id = Column(
        Integer,
        ForeignKey("Wellora_DietChatConversations.id"),
        nullable=False,
        index=True,
    )
    role = Column(String(20), nullable=False)
    content = Column(UnicodeText, nullable=False)
    created_at = Column(DateTime, nullable=False, default=datetime.utcnow)

    conversation = relationship(
        "DietChatConversation",
        back_populates="messages",
    )
