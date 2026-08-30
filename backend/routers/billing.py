import os

from fastapi import APIRouter, Depends

from models.billing import BillingConfiguration, BillingPlan
from routers.auth import require_user

router = APIRouter(prefix="/billing", tags=["billing"], dependencies=[Depends(require_user)])

PLAN_DEFINITIONS = [
    ("starter", "Starter", 39.0, 374.40, 10_000, 3, 5_000, ["Personalized CSV campaigns", "Reply detection", "Inbox health"]),
    ("growth", "Growth", 79.0, 758.40, 25_000, 10, 25_000, ["Everything in Starter", "Advanced analytics", "Reusable Rohly templates"]),
    ("scale", "Scale", 149.0, 1430.40, 75_000, 25, 100_000, ["Everything in Growth", "Higher inbox capacity", "Priority operations"]),
    ("agency", "Agency", 299.0, 2870.40, 200_000, 100, 500_000, ["Everything in Scale", "Agency capacity", "Expanded workspace limits"]),
]


def plan_env_key(plan_key: str, interval: str) -> str:
    return f"PAYPAL_PLAN_{plan_key.upper()}_{interval.upper()}"


@router.get("/status", response_model=BillingConfiguration)
async def billing_status() -> BillingConfiguration:
    configured_ids = sum(
        1 for plan_key, *_ in PLAN_DEFINITIONS for interval in ("MONTHLY", "ANNUAL")
        if os.environ.get(plan_env_key(plan_key, interval))
    )
    credentials = bool(os.environ.get("PAYPAL_CLIENT_ID") and os.environ.get("PAYPAL_CLIENT_SECRET"))
    product = bool(os.environ.get("PAYPAL_PRODUCT_ID"))
    webhook = bool(os.environ.get("PAYPAL_WEBHOOK_ID"))
    return BillingConfiguration(
        mode=os.environ.get("PAYPAL_MODE", "live"),
        credentials_configured=credentials,
        product_id_configured=product,
        configured_plan_ids=configured_ids,
        webhook_configured=webhook,
        checkout_enabled=credentials and product and webhook and configured_ids == 8,
        webhook_url="https://email-throttle.preview.emergentagent.com/api/billing/paypal/webhook",
    )


@router.get("/plans", response_model=list[BillingPlan])
async def billing_plans() -> list[BillingPlan]:
    return [
        BillingPlan(
            key=key,
            name=name,
            monthly_price=monthly,
            annual_price=annual,
            monthly_email_limit=email_limit,
            inbox_limit=inbox_limit,
            contact_limit=contact_limit,
            features=features,
            monthly_plan_id_configured=bool(os.environ.get(plan_env_key(key, "MONTHLY"))),
            annual_plan_id_configured=bool(os.environ.get(plan_env_key(key, "ANNUAL"))),
        )
        for key, name, monthly, annual, email_limit, inbox_limit, contact_limit, features in PLAN_DEFINITIONS
    ]