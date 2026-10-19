from fastapi import APIRouter, Depends
from app.core.auth import User, current_user

router = APIRouter(tags=["auth"])


# Protected route returning current user's profile information from verified Neon token
@router.get("/me")
def get_me(user: User = Depends(current_user)):
    return {
        "id": user.id,
        "email": user.email,
        "name": user.name,
    }
