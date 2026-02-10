from sqlalchemy.orm import Session
from datetime import datetime
from typing import List, Optional
from models import TrainingSession, MachineControlBinding
from schemas import TrainingSessionCreate, TrainingSessionUpdate
from controllers.action_classifier import ActionClassifier

class TrainingController:
    def __init__(self):
        self.action_classifier = ActionClassifier()
    
    def create_session(self, user_id: int, session_data: TrainingSessionCreate, db: Session) -> TrainingSession:
        """Create a new training session"""
        started_at = datetime.utcnow()
        db_session = TrainingSession(
            user_id=user_id,
            name=session_data.name,
            started_at=started_at,
            data=session_data.data,
            notes=session_data.notes
        )
        db.add(db_session)
        db.commit()
        db.refresh(db_session)
        return db_session
    
    def end_session(self, session_id: int, user_id: int, db: Session, additional_data: Optional[dict] = None) -> Optional[TrainingSession]:
        """End a training session and calculate duration"""
        from typing import Optional
        session = db.query(TrainingSession).filter(
            TrainingSession.id == session_id,
            TrainingSession.user_id == user_id
        ).first()
        
        if not session:
            return None
        
        ended_at = datetime.utcnow()
        duration = int((ended_at - session.started_at).total_seconds())
        
        if additional_data:
            current_data = session.data if isinstance(session.data, dict) else {}
            session.data = {**current_data, **additional_data}
        
        session.ended_at = ended_at
        session.duration_seconds = duration
        db.commit()
        db.refresh(session)
        return session
    
    def get_user_sessions(self, user_id: int, db: Session, limit: int = 50) -> List[TrainingSession]:
        """Get all training sessions for a user"""
        return db.query(TrainingSession).filter(
            TrainingSession.user_id == user_id
        ).order_by(TrainingSession.created_at.desc()).limit(limit).all()
    
    def get_session(self, session_id: int, user_id: int, db: Session) -> Optional[TrainingSession]:
        """Get a specific training session"""
        return db.query(TrainingSession).filter(
            TrainingSession.id == session_id,
            TrainingSession.user_id == user_id
        ).first()

    def update_session(self, session_id: int, user_id: int, db: Session, patch: TrainingSessionUpdate) -> Optional[TrainingSession]:
        """Update session name and/or notes."""
        session = self.get_session(session_id, user_id, db)
        if not session:
            return None
        if patch.name is not None:
            session.name = patch.name
        if patch.notes is not None:
            session.notes = patch.notes
        db.commit()
        db.refresh(session)
        return session

    def classify_session(self, session_id: int, user_id: int, db: Session) -> Optional[dict]:
        """Classify a training session based on its data"""
        session = self.get_session(session_id, user_id, db)
        if not session:
            return None
        
        if not isinstance(session.data, dict):
            return {"action": "Unknown", "confidence": 0.0, "reasoning": "Invalid data format"}
        
        return self.action_classifier.classify_session(session.data)

    def delete_session(self, session_id: int, user_id: int, db: Session) -> bool:
        """Delete one training session and any bindings that reference it. Returns True if deleted."""
        session = self.get_session(session_id, user_id, db)
        if not session:
            return False
        db.query(MachineControlBinding).filter(
            MachineControlBinding.training_session_id == session_id
        ).delete(synchronize_session=False)
        db.delete(session)
        db.commit()
        return True

    def delete_all_sessions_and_bindings(self, db: Session) -> tuple[int, int]:
        """Delete all machine_control_bindings then all training_sessions. Returns (n_bindings, n_sessions)."""
        bindings = db.query(MachineControlBinding).all()
        for b in bindings:
            db.delete(b)
        db.flush()
        sessions = db.query(TrainingSession).all()
        for s in sessions:
            db.delete(s)
        db.commit()
        return len(bindings), len(sessions)
