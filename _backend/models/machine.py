from sqlalchemy import Column, Integer, String, DateTime, ForeignKey, JSON
from datetime import datetime
from .base import Base

class Machine(Base):
    __tablename__ = "machines"
    
    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    name = Column(String, nullable=False)
    type = Column(String, nullable=False)  # e.g., "drone", "robot", etc.
    control_positions = Column(JSON, nullable=True)  # Store controls with positions: [{ id: string, description?: string, x: number, y: number, webhook_url?: string }]
    blueprint = Column(String, nullable=True)  # Path to blueprint image
    viewport = Column(JSON, nullable=True)  # Optional saved ReactFlow viewport: { x, y, zoom }
    created_at = Column(DateTime, default=datetime.utcnow)
