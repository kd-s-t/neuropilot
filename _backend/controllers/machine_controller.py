from sqlalchemy.orm import Session
from typing import List, Optional
from models import Machine, MachineControlBinding, TrainingSession, MachineLog
from schemas import MachineCreate, MachineControlBindingCreate

class MachineController:
    def create_machine(self, user_id: int, machine_data: MachineCreate, db: Session) -> Machine:
        """Create a new machine"""
        machine = Machine(
            user_id=user_id,
            name=machine_data.name,
            type=machine_data.type
        )
        db.add(machine)
        db.commit()
        db.refresh(machine)
        return machine
    
    def get_user_machines(self, user_id: int, db: Session) -> List[Machine]:
        """Get all machines for a user"""
        return db.query(Machine).filter(
            Machine.user_id == user_id
        ).order_by(Machine.created_at.desc()).all()
    
    def get_machine(self, machine_id: int, user_id: int, db: Session) -> Optional[Machine]:
        """Get a specific machine"""
        return db.query(Machine).filter(
            Machine.id == machine_id,
            Machine.user_id == user_id
        ).first()
    
    def delete_machine(self, machine_id: int, user_id: int, db: Session) -> bool:
        """Delete a machine and all its bindings"""
        from sqlalchemy.exc import IntegrityError
        
        machine = self.get_machine(machine_id, user_id, db)
        if not machine:
            return False
        
        try:
            # Delete all bindings for this machine first
            db.query(MachineControlBinding).filter(
                MachineControlBinding.machine_id == machine_id,
                MachineControlBinding.user_id == user_id
            ).delete()
            
            # Then delete the machine
            db.delete(machine)
            db.commit()
            return True
        except IntegrityError:
            db.rollback()
            raise
    
    def create_binding(self, machine_id: int, user_id: int, binding_data: MachineControlBindingCreate, db: Session) -> Optional[MachineControlBinding]:
        """Create or update a control binding for a machine"""
        from fastapi import HTTPException, status
        
        # Verify machine belongs to user
        machine = self.get_machine(machine_id, user_id, db)
        if not machine:
            return None
        
        # Verify training session belongs to user
        session = db.query(TrainingSession).filter(
            TrainingSession.id == binding_data.training_session_id,
            TrainingSession.user_id == user_id
        ).first()
        if not session:
            return None
        
        # Check if this training session is already bound to another control on this machine
        existing_session_binding = db.query(MachineControlBinding).filter(
            MachineControlBinding.machine_id == machine_id,
            MachineControlBinding.training_session_id == binding_data.training_session_id,
            MachineControlBinding.control_id != binding_data.control_id
        ).first()
        
        if existing_session_binding:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"This training session is already bound to the '{existing_session_binding.control_id}' control on this machine"
            )
        
        # Check if binding already exists for this control
        existing = db.query(MachineControlBinding).filter(
            MachineControlBinding.machine_id == machine_id,
            MachineControlBinding.control_id == binding_data.control_id
        ).first()
        
        if existing:
            # Update existing binding
            existing.training_session_id = binding_data.training_session_id
            db.commit()
            db.refresh(existing)
            return existing
        else:
            # Create new binding
            binding = MachineControlBinding(
                machine_id=machine_id,
                control_id=binding_data.control_id,
                training_session_id=binding_data.training_session_id,
                user_id=user_id
            )
            db.add(binding)
            db.commit()
            db.refresh(binding)
            return binding
    
    def get_machine_bindings(self, machine_id: int, user_id: int, db: Session) -> List[MachineControlBinding]:
        """Get all bindings for a machine"""
        # Verify machine belongs to user
        machine = self.get_machine(machine_id, user_id, db)
        if not machine:
            return []
        
        return db.query(MachineControlBinding).filter(
            MachineControlBinding.machine_id == machine_id,
            MachineControlBinding.user_id == user_id
        ).all()
    
    def get_control_binding(self, machine_id: int, control_id: str, user_id: int, db: Session) -> Optional[MachineControlBinding]:
        """Get binding for a specific control"""
        return db.query(MachineControlBinding).filter(
            MachineControlBinding.machine_id == machine_id,
            MachineControlBinding.control_id == control_id,
            MachineControlBinding.user_id == user_id
        ).first()
    
    def delete_binding(self, binding_id: int, user_id: int, db: Session) -> bool:
        """Delete a binding"""
        binding = db.query(MachineControlBinding).filter(
            MachineControlBinding.id == binding_id,
            MachineControlBinding.user_id == user_id
        ).first()
        if not binding:
            return False
        db.delete(binding)
        db.commit()
        return True
    
    def update_control_positions(self, machine_id: int, user_id: int, positions: dict, viewport: Optional[dict], db: Session) -> Optional[Machine]:
        """Update control positions for a machine"""
        machine = self.get_machine(machine_id, user_id, db)
        if not machine:
            return None
        
        machine.control_positions = positions
        # Optionally update viewport if provided
        if viewport is not None:
            machine.viewport = viewport
        db.commit()
        db.refresh(machine)
        return machine
    
    def update_blueprint(self, machine_id: int, user_id: int, blueprint_path: str, db: Session) -> Optional[Machine]:
        """Update blueprint path for a machine"""
        machine = self.get_machine(machine_id, user_id, db)
        if not machine:
            return None
        
        machine.blueprint = blueprint_path
        db.commit()
        db.refresh(machine)
        return machine
    
    def get_machine_logs(self, machine_id: int, user_id: int, db: Session, limit: int = 100) -> List[MachineLog]:
        """Get logs for a machine"""
        # Verify machine belongs to user
        machine = self.get_machine(machine_id, user_id, db)
        if not machine:
            return []
        
        return db.query(MachineLog).filter(
            MachineLog.machine_id == machine_id
        ).order_by(MachineLog.created_at.desc()).limit(limit).all()
    
