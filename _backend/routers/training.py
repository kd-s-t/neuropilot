from fastapi import APIRouter, Depends, status, HTTPException, Body
from sqlalchemy.orm import Session
from typing import List, Optional, Dict, Any
from config import get_db
from schemas import TrainingSessionCreate, TrainingSessionResponse, TrainingSessionUpdate
from controllers import TrainingController
from core import get_current_active_user
from models import User

router = APIRouter(prefix="/training", tags=["training"])
training_controller = TrainingController()

@router.post("/sessions", response_model=TrainingSessionResponse, status_code=status.HTTP_201_CREATED)
def create_training_session(
    session_data: TrainingSessionCreate,
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db)
):
    """Create a new training session"""
    return training_controller.create_session(current_user.id, session_data, db)

@router.put("/sessions/{session_id}/end", response_model=TrainingSessionResponse)
def end_training_session(
    session_id: int,
    data: Optional[Dict[str, Any]] = Body(None),
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db)
):
    """End a training session"""
    session = training_controller.end_session(session_id, current_user.id, db, data)
    if not session:
        raise HTTPException(status_code=404, detail="Training session not found")
    return session

@router.get("/sessions", response_model=List[TrainingSessionResponse])
def get_training_sessions(
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db)
):
    """Get all training sessions for the current user"""
    return training_controller.get_user_sessions(current_user.id, db)

@router.get("/sessions/{session_id}", response_model=TrainingSessionResponse)
def get_training_session(
    session_id: int,
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db)
):
    """Get a specific training session"""
    session = training_controller.get_session(session_id, current_user.id, db)
    if not session:
        raise HTTPException(status_code=404, detail="Training session not found")
    return session

@router.patch("/sessions/{session_id}", response_model=TrainingSessionResponse)
def update_training_session(
    session_id: int,
    patch: TrainingSessionUpdate,
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db)
):
    """Update session name and/or notes"""
    session = training_controller.update_session(session_id, current_user.id, db, patch)
    if not session:
        raise HTTPException(status_code=404, detail="Training session not found")
    return session

@router.delete("/sessions", status_code=status.HTTP_200_OK)
def delete_all_training_sessions(
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db)
):
    """Delete all training sessions and machine control bindings."""
    n_bindings, n_sessions = training_controller.delete_all_sessions_and_bindings(db)
    return {"deleted_bindings": n_bindings, "deleted_sessions": n_sessions}

@router.get("/sessions/{session_id}/classify")
def classify_session(
    session_id: int,
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db)
):
    """Classify a training session to determine what action was performed"""
    classification = training_controller.classify_session(session_id, current_user.id, db)
    if not classification:
        raise HTTPException(status_code=404, detail="Training session not found")
    return classification
