from fastapi import APIRouter, Depends, status
from fastapi.security import OAuth2PasswordRequestForm
from sqlalchemy.orm import Session
from config import get_db
from schemas import UserCreate, UserResponse, Token
from controllers import AuthController
from core import get_current_active_user
from models import User

router = APIRouter(prefix="/auth", tags=["auth"])
auth_controller = AuthController()

@router.post("/register", response_model=UserResponse, status_code=status.HTTP_201_CREATED)
def register(user: UserCreate, db: Session = Depends(get_db)):
    return auth_controller.register(user, db)

@router.post("/login", response_model=Token)
def login(form_data: OAuth2PasswordRequestForm = Depends(), db: Session = Depends(get_db)):
    return auth_controller.login(form_data.username, form_data.password, db)

@router.post("/logout")
def logout(current_user: User = Depends(get_current_active_user)):
    return {"message": "Successfully logged out"}

@router.get("/me", response_model=UserResponse)
def read_users_me(current_user: User = Depends(get_current_active_user)):
    return current_user
