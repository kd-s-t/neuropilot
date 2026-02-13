from fastapi import APIRouter, Depends, status, HTTPException, UploadFile, File, Query
from sqlalchemy.orm import Session
from typing import List
import os
import shutil
import httpx
import json
from config import get_db
from schemas import MachineCreate, MachineResponse, MachineControlBindingCreate, MachineControlBindingResponse, MachineUpdatePositions, MachineLogResponse, TriggerWebhookRequest
from controllers import MachineController
from core import get_current_active_user
from models import User, MachineLog

router = APIRouter(prefix="/machines", tags=["machines"])
machine_controller = MachineController()

@router.post("", response_model=MachineResponse, status_code=status.HTTP_201_CREATED)
def create_machine(
    machine_data: MachineCreate,
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db)
):
    """Create a new machine"""
    return machine_controller.create_machine(current_user.id, machine_data, db)

@router.get("", response_model=List[MachineResponse])
def get_machines(
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db)
):
    """Get all machines for the current user"""
    return machine_controller.get_user_machines(current_user.id, db)

@router.get("/{machine_id}", response_model=MachineResponse)
def get_machine(
    machine_id: int,
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db)
):
    """Get a specific machine"""
    machine = machine_controller.get_machine(machine_id, current_user.id, db)
    if not machine:
        raise HTTPException(status_code=404, detail="Machine not found")
    return machine

@router.delete("/{machine_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_machine(
    machine_id: int,
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db)
):
    """Delete a machine"""
    success = machine_controller.delete_machine(machine_id, current_user.id, db)
    if not success:
        raise HTTPException(status_code=404, detail="Machine not found")

@router.post("/{machine_id}/bindings", response_model=MachineControlBindingResponse, status_code=status.HTTP_201_CREATED)
def create_binding(
    machine_id: int,
    binding_data: MachineControlBindingCreate,
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db)
):
    """Create or update a control binding for a machine"""
    binding = machine_controller.create_binding(machine_id, current_user.id, binding_data, db)
    if not binding:
        raise HTTPException(status_code=404, detail="Machine or training session not found")
    return binding

@router.get("/{machine_id}/bindings", response_model=List[MachineControlBindingResponse])
def get_machine_bindings(
    machine_id: int,
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db)
):
    """Get all bindings for a machine"""
    return machine_controller.get_machine_bindings(machine_id, current_user.id, db)

@router.get("/{machine_id}/bindings/{control_id}", response_model=MachineControlBindingResponse)
def get_control_binding(
    machine_id: int,
    control_id: str,
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db)
):
    """Get binding for a specific control"""
    binding = machine_controller.get_control_binding(machine_id, control_id, current_user.id, db)
    if not binding:
        raise HTTPException(status_code=404, detail="Binding not found")
    return binding

@router.delete("/bindings/{binding_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_binding(
    binding_id: int,
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db)
):
    """Delete a binding"""
    success = machine_controller.delete_binding(binding_id, current_user.id, db)
    if not success:
        raise HTTPException(status_code=404, detail="Binding not found")
    return None

@router.put("/{machine_id}/positions", response_model=MachineResponse)
def update_control_positions(
    machine_id: int,
    positions_data: MachineUpdatePositions,
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db)
):
    """Update control positions for a machine"""
    machine = machine_controller.update_control_positions(machine_id, current_user.id, positions_data.control_positions, positions_data.viewport if hasattr(positions_data, "viewport") else None, db)
    if not machine:
        raise HTTPException(status_code=404, detail="Machine not found")
    return machine

@router.post("/{machine_id}/blueprint", response_model=MachineResponse)
async def upload_blueprint(
    machine_id: int,
    file: UploadFile = File(...),
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db)
):
    """Upload a blueprint image for a machine"""
    # Verify machine belongs to user
    machine = machine_controller.get_machine(machine_id, current_user.id, db)
    if not machine:
        raise HTTPException(status_code=404, detail="Machine not found")
    
    # Validate file type
    if not file.content_type or not file.content_type.startswith("image/"):
        raise HTTPException(status_code=400, detail="File must be an image")
    
    # Create blueprints directory if it doesn't exist
    blueprints_dir = "blueprints"
    os.makedirs(blueprints_dir, exist_ok=True)
    
    # Generate filename
    file_extension = os.path.splitext(file.filename)[1] if file.filename else ".png"
    filename = f"machine_{machine_id}_{current_user.id}{file_extension}"
    file_path = os.path.join(blueprints_dir, filename)
    
    # Save file
    try:
        with open(file_path, "wb") as buffer:
            shutil.copyfileobj(file.file, buffer)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error saving file: {str(e)}")
    
    # Update machine with blueprint path
    blueprint_url = f"/blueprints/{filename}"
    machine = machine_controller.update_blueprint(machine_id, current_user.id, blueprint_url, db)
    if not machine:
        raise HTTPException(status_code=500, detail="Error updating machine")
    
    return machine

@router.get("/{machine_id}/logs", response_model=List[MachineLogResponse])
def get_machine_logs(
    machine_id: int,
    limit: int = Query(100, ge=1, le=1000),
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db)
):
    """Get logs for a machine"""
    logs = machine_controller.get_machine_logs(machine_id, current_user.id, db, limit)
    return logs

@router.post("/{machine_id}/trigger-webhook", response_model=MachineLogResponse)
async def trigger_webhook(
    machine_id: int,
    request: TriggerWebhookRequest,
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db)
):
    machine = machine_controller.get_machine(machine_id, current_user.id, db)
    if not machine:
        raise HTTPException(status_code=404, detail="Machine not found")
    control_positions = machine.control_positions or []
    control = next((c for c in control_positions if c.get("id") == request.control_id), None)
    if not control:
        raise HTTPException(status_code=404, detail="Control not found")
    req_url = (request.webhook_url or "").strip()
    ctrl_url = (control.get("webhook_url") or "").strip()
    request_internal = not req_url or req_url == "internal://tello"
    control_internal = not ctrl_url or ctrl_url == "internal://tello"
    use_internal = request_internal or control_internal
    if not use_internal and ctrl_url != req_url:
        raise HTTPException(status_code=400, detail="Command target URL does not match control configuration")

    success = False
    status_code = None
    error_message = None
    response_data = None
    webhook_url = request.webhook_url or "internal://tello"

    if use_internal:
        try:
            import tello as tello_module
            response = tello_module.send_command(request.control_id, request.value)
            success = response is not None
            status_code = 200
            response_data = response
            if not success:
                error_message = "Tello not connected or command not acknowledged. Connect to the drone on the machine page first."
        except Exception as e:
            error_message = str(e)[:1000]
    else:
        try:
            async with httpx.AsyncClient(timeout=15.0) as client:
                response = await client.post(
                    request.webhook_url,
                    json={"control_id": request.control_id, "value": request.value}
                )
                status_code = response.status_code
                try:
                    response_data = json.dumps(response.json())
                except Exception:
                    response_data = response.text[:1000]
                if response.status_code == 200:
                    result = response.json()
                    success = result.get('success', True)
                else:
                    error_message = f"HTTP {response.status_code}: {response.text[:500]}"
        except Exception as e:
            error_message = str(e)[:1000]

    log = MachineLog(
        machine_id=machine_id,
        control_id=request.control_id,
        webhook_url=webhook_url,
        value=request.value,
        success=success,
        status_code=status_code,
        error_message=error_message,
        response_data=response_data
    )
    db.add(log)
    db.commit()
    db.refresh(log)
    return log
