from pydantic import BaseModel
from typing import Optional, Dict, Any, List
from datetime import datetime

class TrainingSessionCreate(BaseModel):
    data: Dict[str, Any]
    notes: Optional[str] = None
    name: Optional[str] = None


class TrainingSessionUpdate(BaseModel):
    name: Optional[str] = None
    notes: Optional[str] = None


class TrainingSessionResponse(BaseModel):
    id: int
    user_id: int
    name: Optional[str]
    started_at: datetime
    ended_at: Optional[datetime]
    duration_seconds: Optional[int]
    data: Dict[str, Any]
    notes: Optional[str]
    created_at: datetime
    
    class Config:
        from_attributes = True
