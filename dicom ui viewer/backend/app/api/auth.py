from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.security import OAuth2PasswordRequestForm
from app.schemas.schemas import Token, UserResponse, UserCreate
from app.auth.auth_service import create_access_token, create_refresh_token, get_password_hash

router = APIRouter(prefix="/auth", tags=["Authentication"])

@router.post("/login", response_model=Token)
async def login(form_data: OAuth2PasswordRequestForm = Depends()):
    """Authenticate credentials and return session tokens"""
    # Simple hardcoded check for user/admin accounts
    if form_data.username == "admin" and form_data.password == "admin":
        access = create_access_token({"sub": "admin", "role": "admin"})
        refresh = create_refresh_token({"sub": "admin"})
        return {"access_token": access, "refresh_token": refresh, "token_type": "bearer"}
    elif form_data.username == "user" and form_data.password == "user":
        access = create_access_token({"sub": "user", "role": "radiologist"})
        refresh = create_refresh_token({"sub": "user"})
        return {"access_token": access, "refresh_token": refresh, "token_type": "bearer"}
        
    raise HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Incorrect username or password"
    )

@router.post("/register", response_model=UserResponse)
async def register(user_in: UserCreate):
    """Register new radiologist or technical user profile"""
    return {
        "id": 1,
        "username": user_in.username,
        "email": user_in.email,
        "role": "radiologist",
        "is_active": True
    }
