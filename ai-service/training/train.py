"""Trains the ticket-category classifier and writes metrics.

    python training/generate_dataset.py
    python training/train.py [--data path/to/tickets.csv]

Outputs: models/ticket_classifier.joblib and models/metrics.json
"""
import argparse
import csv
import json
from pathlib import Path

import joblib
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import accuracy_score, classification_report
from sklearn.model_selection import GroupKFold, GroupShuffleSplit, cross_val_score
from sklearn.pipeline import Pipeline

ROOT = Path(__file__).resolve().parent.parent
MODEL_VERSION = "tfidf-logreg-1"


def load_rows(path: Path):
    with path.open(encoding="utf-8") as handle:
        rows = list(csv.DictReader(handle))
    texts = [row["text"] for row in rows]
    labels = [row["label"] for row in rows]
    groups = [row.get("core_id") or str(index) for index, row in enumerate(rows)]
    return texts, labels, groups


def build_pipeline() -> Pipeline:
    return Pipeline(
        [
            ("tfidf", TfidfVectorizer(ngram_range=(1, 2), sublinear_tf=True, min_df=1)),
            ("clf", LogisticRegression(max_iter=1000, C=5.0)),
        ]
    )


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--data", type=Path, default=ROOT / "training" / "tickets.csv")
    args = parser.parse_args()

    texts, labels, groups = load_rows(args.data)

    # Hold out whole complaints so near-duplicate wordings cannot leak into the test set.
    splitter = GroupShuffleSplit(n_splits=1, test_size=0.25, random_state=42)
    train_idx, test_idx = next(splitter.split(texts, labels, groups))

    x_train = [texts[i] for i in train_idx]
    y_train = [labels[i] for i in train_idx]
    x_test = [texts[i] for i in test_idx]
    y_test = [labels[i] for i in test_idx]

    held_out = build_pipeline().fit(x_train, y_train)
    predictions = held_out.predict(x_test)
    report = classification_report(y_test, predictions, output_dict=True, zero_division=0)

    # 5-fold cross-validation with whole complaints held out in every fold.
    cv_scores = cross_val_score(
        build_pipeline(), texts, labels, groups=groups, cv=GroupKFold(n_splits=5), scoring="f1_macro"
    )

    metrics = {
        "model_version": MODEL_VERSION,
        "cv_macro_f1_mean": round(float(cv_scores.mean()), 4),
        "cv_macro_f1_std": round(float(cv_scores.std()), 4),
        "data_file": args.data.name,
        "train_rows": len(x_train),
        "test_rows": len(x_test),
        "accuracy": round(accuracy_score(y_test, predictions), 4),
        "macro_precision": round(report["macro avg"]["precision"], 4),
        "macro_recall": round(report["macro avg"]["recall"], 4),
        "macro_f1": round(report["macro avg"]["f1-score"], 4),
        "per_class": {
            label: {
                "precision": round(values["precision"], 4),
                "recall": round(values["recall"], 4),
                "f1": round(values["f1-score"], 4),
                "support": int(values["support"]),
            }
            for label, values in report.items()
            if label not in ("accuracy", "macro avg", "weighted avg")
        },
        "note": "Measured on held-out complaints from the SYNTHETIC template dataset. "
        "Not a prediction of real-world accuracy.",
    }

    # Final model uses all data.
    final_model = build_pipeline().fit(texts, labels)
    (ROOT / "models").mkdir(exist_ok=True)
    joblib.dump({"pipeline": final_model, "version": MODEL_VERSION}, ROOT / "models" / "ticket_classifier.joblib")
    (ROOT / "models" / "metrics.json").write_text(json.dumps(metrics, indent=2))

    print(classification_report(y_test, predictions, zero_division=0))
    print(f"Macro F1 on held-out complaints (single split): {metrics['macro_f1']}")
    print(f"Macro F1, 5-fold grouped CV: {metrics['cv_macro_f1_mean']} +/- {metrics['cv_macro_f1_std']}")


if __name__ == "__main__":
    main()
