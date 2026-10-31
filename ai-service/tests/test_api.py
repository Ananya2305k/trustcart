import os

os.environ.pop("ANTHROPIC_API_KEY", None)  # tests must never call a real LLM

import pytest
from fastapi.testclient import TestClient

from app.main import app
from app.rules import analyse_sentiment, analyse_urgency


@pytest.fixture(scope="module")
def client():
    with TestClient(app) as test_client:
        yield test_client


def analyze(client, subject, message):
    response = client.post("/analyze", json={"subject": subject, "message": message})
    assert response.status_code == 200
    return response.json()


def test_health_reports_model(client):
    body = client.get("/health").json()
    assert body["status"] == "ok"
    assert body["model_version"]


@pytest.mark.parametrize(
    "message,expected",
    [
        ("My parcel has not arrived and the delivery date passed", "Delivery"),
        ("I want my money back, the refund is still pending", "Refund & Return"),
        ("The item arrived damaged and the screen is cracked", "Product Quality"),
        ("I cannot log in, the password reset does not work", "Account"),
        ("Please cancel my order before it ships", "Order Change"),
    ],
)
def test_category_prediction(client, message, expected):
    assert analyze(client, "Help", message)["category"] == expected


def test_response_shape(client):
    body = analyze(client, "Late", "Where is my order?")
    assert 0 <= body["confidence"] <= 1
    assert len(body["top3"]) == 3
    assert body["urgency"]["level"] in {"low", "medium", "high"}
    assert body["sentiment"]["label"] in {"negative", "neutral", "positive"}
    assert body["reply_source"] == "template"
    assert body["suggested_reply"]


def test_double_charge_is_high_urgency(client):
    body = analyze(client, "Charged twice", "I was charged twice for the same order, please fix this")
    assert body["urgency"]["level"] == "high"
    assert "charged twice" in body["urgency"]["signals"]
    assert body["suggested_reply"].startswith("We understand this is urgent")


def test_validation_rejects_empty_message(client):
    assert client.post("/analyze", json={"subject": "x", "message": ""}).status_code == 422


def test_sentiment_rules():
    assert analyse_sentiment("This is terrible and the worst service")["label"] == "negative"
    assert analyse_sentiment("Thank you, great service, I am happy")["label"] == "positive"
    assert analyse_sentiment("What are your support hours")["label"] == "neutral"
    # negation flips positive words
    assert analyse_sentiment("this is not good")["score"] <= 0


def test_urgency_rules():
    assert analyse_urgency("someone else accessed my account", 0)["level"] == "high"
    assert analyse_urgency("do you ship to other cities", 0)["level"] == "low"
