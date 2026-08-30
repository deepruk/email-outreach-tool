from pydantic import BaseModel


class BillingPlan(BaseModel):
    key: str
    name: str
    monthly_price: float
    annual_price: float
    monthly_email_limit: int
    inbox_limit: int
    contact_limit: int
    features: list[str]
    monthly_plan_id_configured: bool
    annual_plan_id_configured: bool


class BillingConfiguration(BaseModel):
    provider: str = "PayPal"
    mode: str
    credentials_configured: bool
    product_id_configured: bool
    configured_plan_ids: int
    required_plan_ids: int = 8
    webhook_configured: bool
    checkout_enabled: bool
    webhook_url: str