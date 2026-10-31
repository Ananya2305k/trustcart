"""Rule-based sentiment and urgency detection.

These are transparent lexicon rules, not trained models. Every urgency level
comes with the signals that triggered it so a human can see why.
"""
import re

NEGATIVE = {
    "angry", "terrible", "worst", "awful", "horrible", "useless", "disappointed",
    "unacceptable", "ridiculous", "fed up", "frustrated", "cheated", "scam", "fraud",
    "poor", "bad", "damaged", "broken", "never", "waste", "rude", "pathetic",
    "late", "missing", "wrong", "stuck", "charged twice", "no response",
}
POSITIVE = {"thank", "thanks", "great", "good", "happy", "love", "appreciate", "excellent", "perfect", "wonderful"}
NEGATORS = {"not", "no", "never", "n't"}

HIGH_URGENCY = [
    ("charged twice", r"charged twice|double charge|deducted twice"),
    ("money deducted but order failed", r"deducted.*(failed|not placed)|(failed|not placed).*deducted"),
    ("possible account compromise", r"someone else.*(accessed|using)|hacked|unauthori[sz]ed|accessed my account"),
    ("fraud mentioned", r"\bfraud\b|\bscam\b"),
    ("legal or chargeback threat", r"lawyer|legal action|consumer court|chargeback|police"),
    ("explicit urgency", r"\burgent(ly)?\b|\basap\b|immediately|right now|emergency"),
    ("safety concern", r"\bburn(t|ing)?\b|\bsmoke\b|\bshock\b|\bsparks?\b|\bfire\b"),
]
MEDIUM_URGENCY = [
    ("order missing or very late", r"never (received|arrived)|not (arrived|received)|still (not|pending)|very late|has not (arrived|updated)"),
    ("repeated contact", r"again|still waiting|no response|last week|several days|for days"),
    ("damaged or wrong item", r"damaged|broken|cracked|wrong item|not working|stopped working|missing a part"),
    ("refund pending", r"refund.*(pending|not|yet)"),
]


def _tokens(text: str):
    return re.findall(r"[a-z']+", text.lower())


def analyse_sentiment(text: str):
    lowered = text.lower()
    tokens = _tokens(lowered)
    score = 0
    for index, token in enumerate(tokens):
        negated = index > 0 and tokens[index - 1] in NEGATORS
        if token in POSITIVE:
            score += -1 if negated else 1
        elif token in NEGATIVE:
            score += 0 if negated else -1
    for phrase in (p for p in NEGATIVE if " " in p):
        if phrase in lowered:
            score -= 1
    if lowered.count("!") >= 2:
        score -= 1

    # Squash to roughly [-1, 1].
    normalised = max(-1.0, min(1.0, score / 3))
    label = "negative" if normalised <= -0.34 else "positive" if normalised >= 0.34 else "neutral"
    return {"label": label, "score": round(normalised, 2)}


def analyse_urgency(text: str, sentiment_score: float):
    lowered = text.lower()
    high = [name for name, pattern in HIGH_URGENCY if re.search(pattern, lowered)]
    medium = [name for name, pattern in MEDIUM_URGENCY if re.search(pattern, lowered)]

    if high:
        return {"level": "high", "signals": high + medium}
    if len(medium) >= 2 or (medium and sentiment_score <= -0.34):
        return {"level": "medium", "signals": medium}
    if medium:
        return {"level": "medium", "signals": medium}
    if sentiment_score <= -0.67:
        return {"level": "medium", "signals": ["strongly negative tone"]}
    return {"level": "low", "signals": []}
