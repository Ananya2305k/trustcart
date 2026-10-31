"""Suggested replies for support agents.

Default: category templates. Optional: if ANTHROPIC_API_KEY is set, an LLM
drafts the reply, and any failure silently falls back to the template.
The suggestion is always for an agent to review; it is never sent automatically.
"""
import os

import httpx

TEMPLATES = {
    "Delivery": "Hi, sorry for the wait with your delivery. We are checking the latest recorded status of your order and will update you here. You can also follow it in My orders, where every recorded step has a timestamp.",
    "Refund & Return": "Hi, thanks for reaching out about your refund or return. We are looking at your request now. Its current stage and every update are visible under Returns & refunds, and we will explain the decision there.",
    "Payment": "Hi, sorry about the payment trouble. We are checking the transaction against your order. Please do not retry the payment while we look into it, and we will confirm the outcome here.",
    "Product Quality": "Hi, we are sorry the product was not as expected. Please share a photo of the item and the packaging if you can. If the order was delivered within the last 7 days you can request a refund under Returns & refunds.",
    "Account": "Hi, we can help with your account. For your security we will never ask for your password. Please tell us the email address on the account and what you see when the problem happens.",
    "Order Change": "Hi, we are checking whether your order can still be changed. Orders can be cancelled from My orders until they ship. Once shipped, they can no longer be edited.",
    "General": "Hi, thanks for your question. We will get back to you here shortly with a clear answer.",
}

URGENT_PREFIX = "We understand this is urgent and are prioritising it. "


def template_reply(category: str, urgency: str) -> str:
    base = TEMPLATES.get(category, TEMPLATES["General"])
    return URGENT_PREFIX + base if urgency == "high" else base


def llm_reply(subject: str, message: str, category: str, urgency: str):
    """Returns a drafted reply, or None when the LLM is not configured or fails."""
    api_key = os.getenv("ANTHROPIC_API_KEY")
    if not api_key:
        return None

    prompt = (
        "You draft replies for an e-commerce support agent to review. Be brief, polite and honest. "
        "Do not promise refunds, delivery dates or outcomes you cannot guarantee. "
        "Do not invent order details. Reply with the message text only.\n\n"
        f"Detected category: {category}\nUrgency: {urgency}\n"
        f"Subject: {subject}\nCustomer message: {message}"
    )
    try:
        response = httpx.post(
            "https://api.anthropic.com/v1/messages",
            headers={
                "x-api-key": api_key,
                "anthropic-version": "2023-06-01",
                "content-type": "application/json",
            },
            json={
                "model": os.getenv("LLM_MODEL", "claude-sonnet-5-5"),
                "max_tokens": 400,
                "messages": [{"role": "user", "content": prompt}],
            },
            timeout=8.0,
        )
        response.raise_for_status()
        blocks = response.json().get("content", [])
        text = "".join(block.get("text", "") for block in blocks if block.get("type") == "text").strip()
        return text or None
    except Exception:
        return None


def suggest_reply(subject: str, message: str, category: str, urgency: str):
    drafted = llm_reply(subject, message, category, urgency)
    if drafted:
        return drafted, "llm"
    return template_reply(category, urgency), "template"
