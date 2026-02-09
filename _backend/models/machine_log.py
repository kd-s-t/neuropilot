from sqlalchemy import Column, Integer, String, DateTime, ForeignKey, Text, Boolean
from datetime import datetime
from .base import Base

class MachineLog(Base):
    __tablename__ = "machine_logs"
    
    id = Column(Integer, primary_key=True, index=True)
    machine_id = Column(Integer, ForeignKey("machines.id"), nullable=False, index=True)
    control_id = Column(String, nullable=False, index=True)
    webhook_url = Column(String, nullable=False)
    value = Column(Integer, nullable=True)
    success = Column(Boolean, nullable=False)
    status_code = Column(Integer, nullable=True)
    error_message = Column(Text, nullable=True)
    response_data = Column(Text, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False, index=True)
