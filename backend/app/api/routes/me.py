from fastapi import APIRouter, Depends
from app.core.auth import User, current_user
from app.core.config import settings

router = APIRouter(tags=["auth"])


# Protected route returning current user's profile information from verified Neon token
@router.get("/me")
def get_me(user: User = Depends(current_user)):
    return {
        "id": user.id,
        "email": user.email,
        "name": user.name,
        "customization_enabled": settings.is_customization_enabled_for(user.id),
    }
