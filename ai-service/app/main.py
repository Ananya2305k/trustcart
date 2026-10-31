from contextlib import asynccontextmanager

from fastapi import FastAPI, HTTPException
from pydantic import BaseModel, Field

from .classifier import TicketClassifier
from .replies import suggest_reply
from .rules import analyse_sentiment, analyse_urgency

state: dict = {}


@asynccontextmanager
async def lifespan(_app: FastAPI):
    state["classifier"] = TicketClassifier()
    yield
    state.clear()


app = FastAPI(title="TrustCart ticket analysis", version="1.0.0", lifespan=lifespan)


class AnalyzeRequest(BaseModel):
    subject: str = Field(default="", max_length=200)
    message: str = Field(min_length=1, max_length=4000)


@app.get("/health")
def health():
    classifier = state.get("classifier")
    return {"status": "ok" if classifier else "model_not_loaded", "model_version": getattr(classifier, "version", None)}


@app.post("/analyze")
def analyze(request: AnalyzeRequest):
    classifier = state.get("classifier")
    if classifier is None:
        raise HTTPException(status_code=503, detail="Model not loaded")

    text = f"{request.subject}. {request.message}".strip()
    prediction = classifier.predict(text)
    sentiment = analyse_sentiment(text)
    urgency = analyse_urgency(text, sentiment["score"])
    reply, source = suggest_reply(request.subject, request.message, prediction["category"], urgency["level"])

    return {
        "category": prediction["category"],
        "confidence": prediction["confidence"],
        "top3": prediction["top3"],
        "sentiment": sentiment,
        "urgency": urgency,
        "suggested_reply": reply,
        "reply_source": source,
        "model_version": classifier.version,
    }
