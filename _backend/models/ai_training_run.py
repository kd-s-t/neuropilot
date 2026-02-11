from sqlalchemy import Column, Integer, String, DateTime, ForeignKey, JSON, Text
from datetime import datetime
from .base import Base


class AITrainingRun(Base):
    __tablename__ = "ai_training_runs"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    session_ids = Column(JSON, nullable=False)
    conclusion_text = Column(Text, nullable=True)
    conclusion_data = Column(JSON, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
