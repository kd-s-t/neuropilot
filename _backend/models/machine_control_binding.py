from sqlalchemy import Column, Integer, String, DateTime, ForeignKey, UniqueConstraint
from datetime import datetime
from .base import Base

class MachineControlBinding(Base):
    __tablename__ = "machine_control_bindings"
    
    id = Column(Integer, primary_key=True, index=True)
    machine_id = Column(Integer, ForeignKey("machines.id"), nullable=False, index=True)
    control_id = Column(String, nullable=False)  # "forward", "reverse", "left", "right", "start", "stop"
    training_session_id = Column(Integer, ForeignKey("training_sessions.id"), nullable=False, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    
    __table_args__ = (
        UniqueConstraint("machine_id", "control_id", name="uq_machine_control"),
    )
