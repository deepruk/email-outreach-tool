from datetime import datetime

from pydantic import BaseModel, Field



class UserPublic(BaseModel):
    id: str
    email: str
    name: str
    role: str = "owner"
    created_at: datetime
    email_verified: bool = False


class UserRecord(UserPublic):
    password_hash: str


class LoginRequest(BaseModel):
    email: str = Field(min_length=3, max_length=320)
    password: str = Field(min_length=8, max_length=256)


class SignupRequest(BaseModel):
    name: str = Field(min_length=1, max_length=100)
    email: str = Field(min_length=3, max_length=320)
    password: str = Field(min_length=10, max_length=256)


class ProfileUpdate(BaseModel):
    name: str = Field(min_length=1, max_length=100)


class VerifyEmailRequest(BaseModel):
    token: str = Field(min_length=20, max_length=500)


class ResendVerificationRequest(BaseModel):
    email: str = Field(min_length=3, max_length=320)


class PasswordUpdate(BaseModel):
    current_password: str
    new_password: str = Field(min_length=10, max_length=256)