from pathlib import Path

import joblib

MODEL_PATH = Path(__file__).resolve().parent.parent / "models" / "ticket_classifier.joblib"


class TicketClassifier:
    def __init__(self, path: Path = MODEL_PATH):
        if not path.exists():
            raise FileNotFoundError(
                f"{path} not found. Run: python training/generate_dataset.py && python training/train.py"
            )
        bundle = joblib.load(path)
        self.pipeline = bundle["pipeline"]
        self.version = bundle["version"]

    def predict(self, text: str):
        probabilities = self.pipeline.predict_proba([text])[0]
        classes = self.pipeline.classes_
        ranked = sorted(zip(classes, probabilities), key=lambda pair: pair[1], reverse=True)
        top_label, top_prob = ranked[0]
        return {
            "category": str(top_label),
            "confidence": round(float(top_prob), 3),
            "top3": [{"category": str(label), "probability": round(float(p), 3)} for label, p in ranked[:3]],
        }
