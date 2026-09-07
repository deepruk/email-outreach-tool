from contextlib import asynccontextmanager
import asyncio
from fastapi import FastAPI, APIRouter
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
import os
import logging
from pathlib import Path
from pydantic import BaseModel, Field
from typing import List
import uuid
from datetime import datetime
from routers.scheduler import oauth_router, router as scheduler_router
from routers.csv_campaigns import process_due_sends, router as csv_campaigns_router
from routers.rohly_campaigns import process_template_campaigns, router as rohly_campaigns_router
from routers.rohly_campaign_lists import router as rohly_campaign_lists_router
from routers.auth import ensure_owner, router as auth_router
from routers.product import process_reply_sync, router as product_router
from routers.billing import router as billing_router
from routers.open_tracking import router as open_tracking_router
from lib import csv_schedule_patch


ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

from lib.db import client, db


@asynccontextmanager
async def lifespan(app: FastAPI):
    await ensure_owner()
    sender_task = asyncio.create_task(process_due_sends())
    rohly_sender_task = asyncio.create_task(process_template_campaigns())
    reply_task = asyncio.create_task(process_reply_sync())
    yield
    sender_task.cancel()
    rohly_sender_task.cancel()
    reply_task.cancel()
    client.close()


app = FastAPI(lifespan=lifespan)
api_router = APIRouter(prefix="/api")


class StatusCheck(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    client_name: str
    timestamp: datetime = Field(default_factory=datetime.utcnow)

class StatusCheckCreate(BaseModel):
    client_name: str


@api_router.get("/")
async def root():
    return {"message": "Hello World"}

@api_router.post("/status", response_model=StatusCheck)
async def create_status_check(input: StatusCheckCreate):
    status_dict = input.model_dump()
    status_obj = StatusCheck(**status_dict)
    _ = await db.status_checks.insert_one(status_obj.model_dump())
    return status_obj

@api_router.get("/status", response_model=List[StatusCheck])
async def get_status_checks():
    status_checks = await db.status_checks.find().to_list(1000)
    return [StatusCheck(**status_check) for status_check in status_checks]

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=os.environ.get('CORS_ORIGINS', '*').split(','),
    allow_methods=["*"],
    allow_headers=["*"],
)

logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

api_router.include_router(scheduler_router)
api_router.include_router(oauth_router)
api_router.include_router(csv_campaigns_router)
api_router.include_router(rohly_campaigns_router)
api_router.include_router(rohly_campaign_lists_router)
api_router.include_router(open_tracking_router)
api_router.include_router(auth_router)
api_router.include_router(product_router)
api_router.include_router(billing_router)

app.include_router(api_router)
