from pydantic import BaseModel
from datetime import datetime
from typing import Optional, Dict, Any, List

class MachineCreate(BaseModel):
    name: str
    type: str

class MachineResponse(BaseModel):
    id: int
    user_id: int
    name: str
    type: str
    control_positions: Optional[List[Dict[str, Any]]] = None  # [{ id: string, description?: string, x: number, y: number, icon?: string, bgColor?: string, webhook_url?: string }]
    viewport: Optional[Dict[str, Any]] = None
    blueprint: Optional[str] = None
    created_at: datetime
    
    class Config:
        from_attributes = True

class MachineUpdatePositions(BaseModel):
    control_positions: List[Dict[str, Any]]  # [{ id: string, description?: string, x: number, y: number, icon?: string, bgColor?: string, webhook_url?: string }]
    viewport: Optional[Dict[str, Any]] = None

class MachineControlBindingCreate(BaseModel):
    control_id: str
    training_session_id: int

class MachineControlBindingResponse(BaseModel):
    id: int
    machine_id: int
    control_id: str
    training_session_id: int
    user_id: int
    created_at: datetime
    
    class Config:
        from_attributes = True

class MachineLogResponse(BaseModel):
    id: int
    machine_id: int
    control_id: str
    webhook_url: str
    value: Optional[int] = None
    success: bool
    status_code: Optional[int] = None
    error_message: Optional[str] = None
    response_data: Optional[str] = None
    created_at: datetime
    
    class Config:
        from_attributes = True

class TriggerWebhookRequest(BaseModel):
    control_id: str
    webhook_url: str
    value: Optional[int] = None

