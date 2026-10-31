"""Delivery-promise experiment on the public Olist Brazilian e-commerce data.

Question
--------
Orders are given a promised delivery date at purchase. Can a data-driven
promise (quantile regression) keep the same late rate as the platform's own
promises with SHORTER promises, or fewer late deliveries at the SAME length?

Why "at the same average promise length"
----------------------------------------
Promising 60 days makes almost nothing late, but the promise is useless.
Every policy therefore trades late rate against promise length. We compare
the whole trade-off curve, never the late rate alone.

Method (known technique, not new: quantile regression for delivery promises
appears in published work, see README)
- calendar-day basis: promise and actual are counted in days after the
  purchase day;
- time-based split: train on the oldest 80% of orders, test on the newest 20%
  (no random shuffling, so there is no leakage from the future);
- model: one gradient-boosted quantile regressor per quantile q;
- baselines: (1) the platform's own promised date, (2) one global quantile of
  past delivery times applied to every order ("fixed window");
- uncertainty: bootstrap over test orders.

Usage
-----
    python run_experiment.py --data-dir path/to/olist_csvs --out results
"""
from __future__ import annotations

import argparse
import json
from pathlib import Path

import numpy as np
import pandas as pd
from sklearn.ensemble import HistGradientBoostingRegressor

QUANTILES = [0.50, 0.60, 0.70, 0.75, 0.80, 0.85, 0.90, 0.93, 0.95, 0.97, 0.99]
CATEGORICAL = ["customer_state", "seller_state", "product_category"]
NUMERIC = [
    "price",
    "freight_value",
    "n_items",
    "weight_g",
    "purchase_month",
    "purchase_dow",
    "purchase_hour",
    "same_state",
]
MAX_ACTUAL_DAYS = 120  # drop absurd outliers (data errors)


# ----------------------------------------------------------------- data ----
def load_orders(data_dir: Path) -> tuple[pd.DataFrame, dict]:
    """Builds one row per delivered order with features and the two targets."""
    orders = pd.read_csv(
        data_dir / "olist_orders_dataset.csv",
        parse_dates=[
            "order_purchase_timestamp",
            "order_delivered_customer_date",
            "order_estimated_delivery_date",
        ],
    )
    items = pd.read_csv(data_dir / "olist_order_items_dataset.csv")
    customers = pd.read_csv(data_dir / "olist_customers_dataset.csv")
    sellers = pd.read_csv(data_dir / "olist_sellers_dataset.csv")
    products = pd.read_csv(data_dir / "olist_products_dataset.csv")

    info: dict = {"orders_in_file": int(len(orders))}

    orders = orders[orders["order_status"] == "delivered"].dropna(
        subset=[
            "order_purchase_timestamp",
            "order_delivered_customer_date",
            "order_estimated_delivery_date",
        ]
    )
    info["delivered_with_all_dates"] = int(len(orders))

    items = items.merge(
        products[["product_id", "product_category_name", "product_weight_g"]],
        on="product_id",
        how="left",
    )
    per_order = (
        items.sort_values(["order_id", "order_item_id"])
        .groupby("order_id")
        .agg(
            seller_id=("seller_id", "first"),
            price=("price", "sum"),
            freight_value=("freight_value", "sum"),
            n_items=("order_item_id", "count"),
            weight_g=("product_weight_g", "sum"),
            product_category=("product_category_name", "first"),
        )
        .reset_index()
    )

    df = (
        orders.merge(per_order, on="order_id", how="inner")
        .merge(customers[["customer_id", "customer_state"]], on="customer_id", how="left")
        .merge(sellers[["seller_id", "seller_state"]], on="seller_id", how="left")
    )

    purchase_day = df["order_purchase_timestamp"].dt.normalize()
    df["actual_days"] = (
        df["order_delivered_customer_date"].dt.normalize() - purchase_day
    ).dt.days
    df["platform_days"] = (
        df["order_estimated_delivery_date"].dt.normalize() - purchase_day
    ).dt.days

    before = len(df)
    df = df[(df["actual_days"] >= 0) & (df["actual_days"] <= MAX_ACTUAL_DAYS)]
    df = df[df["platform_days"] >= 0]
    info["dropped_outliers"] = int(before - len(df))

    df["purchase_month"] = df["order_purchase_timestamp"].dt.month
    df["purchase_dow"] = df["order_purchase_timestamp"].dt.day_of_week
    df["purchase_hour"] = df["order_purchase_timestamp"].dt.hour
    df["same_state"] = (df["customer_state"] == df["seller_state"]).astype(int)
    df["weight_g"] = df["weight_g"].fillna(df["weight_g"].median())

    df = df.sort_values("order_purchase_timestamp").reset_index(drop=True)
    info["orders_used"] = int(len(df))
    return df, info


def time_split(df: pd.DataFrame, test_fraction: float = 0.2):
    cut = int(len(df) * (1 - test_fraction))
    return df.iloc[:cut].copy(), df.iloc[cut:].copy()


# ------------------------------------------------------------- features ----
class Encoder:
    """Maps categories to integer codes learned on TRAIN only (unseen -> NaN)."""

    def __init__(self) -> None:
        self.maps: dict[str, dict] = {}

    def fit(self, df: pd.DataFrame) -> "Encoder":
        for col in CATEGORICAL:
            values = sorted(df[col].dropna().astype(str).unique())
            self.maps[col] = {v: i for i, v in enumerate(values)}
        return self

    def transform(self, df: pd.DataFrame) -> np.ndarray:
        cols = []
        for col in CATEGORICAL:
            mapping = self.maps[col]
            cols.append(df[col].astype(str).map(mapping).astype(float).to_numpy())
        for col in NUMERIC:
            cols.append(df[col].astype(float).to_numpy())
        return np.column_stack(cols)

    @property
    def categorical_mask(self) -> list[bool]:
        return [True] * len(CATEGORICAL) + [False] * len(NUMERIC)


# ------------------------------------------------------------- policies ----
def fit_quantile_models(x_train, y_train, mask, quantiles, seed=0):
    models = {}
    for q in quantiles:
        model = HistGradientBoostingRegressor(
            loss="quantile",
            quantile=q,
            max_iter=150,
            learning_rate=0.08,
            categorical_features=mask,
            random_state=seed,
        )
        models[q] = model.fit(x_train, y_train)
    return models


def predict_promises(models, x, quantiles) -> np.ndarray:
    """Whole-day promises, shape (n_orders, n_quantiles), never crossing."""
    raw = np.column_stack([models[q].predict(x) for q in quantiles])
    raw = np.maximum.accumulate(raw, axis=1)  # higher q never promises less
    return np.ceil(np.maximum(raw, 0)).astype(int)


def curve_point(actual: np.ndarray, promised: np.ndarray) -> tuple[float, float]:
    """(mean promised days, late rate %) for one policy."""
    return float(promised.mean()), float((actual > promised).mean() * 100)


def build_curve(actual, promise_matrix):
    points = [curve_point(actual, promise_matrix[:, j]) for j in range(promise_matrix.shape[1])]
    points.sort()
    return np.array(points)  # columns: mean_promised, late_pct


def late_at_length(curve: np.ndarray, target_length: float) -> float:
    """Late rate (%) the curve achieves at a given mean promise length."""
    return float(np.interp(target_length, curve[:, 0], curve[:, 1]))


def length_at_late(curve: np.ndarray, target_late: float) -> float:
    """Mean promise length needed to reach a given late rate (curve is decreasing)."""
    order = np.argsort(curve[:, 1])  # np.interp needs increasing x
    return float(np.interp(target_late, curve[order, 1], curve[order, 0]))


def evaluate(actual, platform, model_matrix, global_matrix):
    p_len, p_late = curve_point(actual, platform)
    model_curve = build_curve(actual, model_matrix)
    global_curve = build_curve(actual, global_matrix)
    return {
        "platform_mean_days": p_len,
        "platform_late_pct": p_late,
        "model_late_at_platform_length": late_at_length(model_curve, p_len),
        "global_late_at_platform_length": late_at_length(global_curve, p_len),
        "model_days_at_platform_late": length_at_late(model_curve, p_late),
        "global_days_at_platform_late": length_at_late(global_curve, p_late),
        "model_curve": model_curve,
        "global_curve": global_curve,
    }


def bootstrap(actual, platform, model_matrix, global_matrix, n_boot=200, seed=0):
    rng = np.random.default_rng(seed)
    n = len(actual)
    diffs_late, diffs_days = [], []
    for _ in range(n_boot):
        idx = rng.integers(0, n, n)
        r = evaluate(actual[idx], platform[idx], model_matrix[idx], global_matrix[idx])
        diffs_late.append(r["platform_late_pct"] - r["model_late_at_platform_length"])
        diffs_days.append(r["platform_mean_days"] - r["model_days_at_platform_late"])
    ci = lambda v: [float(np.percentile(v, 2.5)), float(np.percentile(v, 97.5))]
    return {"late_pct_points_saved_ci95": ci(diffs_late), "days_saved_ci95": ci(diffs_days)}


# --------------------------------------------------------------- review ----
def review_effect(data_dir: Path, df: pd.DataFrame):
    path = data_dir / "olist_order_reviews_dataset.csv"
    if not path.exists():
        return None
    reviews = pd.read_csv(path)[["order_id", "review_score"]]
    reviews = reviews.groupby("order_id")["review_score"].mean().reset_index()
    merged = df.merge(reviews, on="order_id", how="inner")
    late = merged["actual_days"] > merged["platform_days"]
    if late.sum() == 0 or (~late).sum() == 0:
        return None
    return {
        "orders_with_reviews": int(len(merged)),
        "mean_review_on_time": float(merged.loc[~late, "review_score"].mean()),
        "mean_review_late": float(merged.loc[late, "review_score"].mean()),
    }


# ----------------------------------------------------------------- main ----
def run(data_dir: Path, out_dir: Path, n_boot: int = 200) -> dict:
    out_dir.mkdir(parents=True, exist_ok=True)
    df, info = load_orders(data_dir)
    train, test = time_split(df)

    encoder = Encoder().fit(train)
    x_train, x_test = encoder.transform(train), encoder.transform(test)
    y_train = train["actual_days"].to_numpy(dtype=float)

    models = fit_quantile_models(x_train, y_train, encoder.categorical_mask, QUANTILES)
    model_matrix = predict_promises(models, x_test, QUANTILES)

    # Baseline 2: the same whole-day promise for every order, from past deliveries.
    global_matrix = np.column_stack(
        [np.full(len(test), int(np.ceil(np.quantile(y_train, q)))) for q in QUANTILES]
    )

    actual = test["actual_days"].to_numpy()
    platform = test["platform_days"].to_numpy()
    result = evaluate(actual, platform, model_matrix, global_matrix)
    ci = bootstrap(actual, platform, model_matrix, global_matrix, n_boot=n_boot)

    summary = {
        "data": info,
        "split": {
            "train_orders": int(len(train)),
            "test_orders": int(len(test)),
            "train_from": str(train["order_purchase_timestamp"].min().date()),
            "train_to": str(train["order_purchase_timestamp"].max().date()),
            "test_from": str(test["order_purchase_timestamp"].min().date()),
            "test_to": str(test["order_purchase_timestamp"].max().date()),
        },
        "platform": {
            "mean_promised_days": round(result["platform_mean_days"], 2),
            "late_pct": round(result["platform_late_pct"], 2),
        },
        "same_average_length": {
            "model_late_pct": round(result["model_late_at_platform_length"], 2),
            "global_quantile_late_pct": round(result["global_late_at_platform_length"], 2),
        },
        "same_late_rate": {
            "model_mean_promised_days": round(result["model_days_at_platform_late"], 2),
            "global_quantile_mean_promised_days": round(result["global_days_at_platform_late"], 2),
        },
        "bootstrap_95ci": {k: [round(x, 2) for x in v] for k, v in ci.items()},
        "review_effect_of_platform_lateness": review_effect(data_dir, df),
        "caveats": [
            "Olist is Brazilian marketplace data (2016-2018), not Indian.",
            "Only one chronological split; results can differ for other periods.",
            "Order-level features only; no carrier or route data.",
        ],
    }

    (out_dir / "results.json").write_text(json.dumps(summary, indent=2))
    write_plot(out_dir / "tradeoff.png", result, summary)
    (out_dir / "summary.md").write_text(render_summary(summary))
    return summary


def write_plot(path: Path, result: dict, summary: dict) -> None:
    import matplotlib

    matplotlib.use("Agg")
    import matplotlib.pyplot as plt

    fig, ax = plt.subplots(figsize=(7, 4.5))
    mc, gc = result["model_curve"], result["global_curve"]
    ax.plot(mc[:, 0], mc[:, 1], "o-", label="Quantile model (per order)")
    ax.plot(gc[:, 0], gc[:, 1], "s--", label="One fixed window for all orders")
    ax.scatter(
        [result["platform_mean_days"]],
        [result["platform_late_pct"]],
        marker="*",
        s=220,
        color="crimson",
        zorder=5,
        label="Platform's own promise",
    )
    ax.set_xlabel("Average promised days after purchase (shorter is better)")
    ax.set_ylabel("Late deliveries, % of test orders (lower is better)")
    ax.set_title(f"Promise length vs late rate ({summary['split']['test_orders']} test orders)")
    ax.grid(alpha=0.3)
    ax.legend()
    fig.tight_layout()
    fig.savefig(path, dpi=150)
    plt.close(fig)


def render_summary(s: dict) -> str:
    p, a, b = s["platform"], s["same_average_length"], s["same_late_rate"]
    ci = s["bootstrap_95ci"]
    lines = [
        "# Delivery promise experiment: results",
        "",
        f"Test set: {s['split']['test_orders']} delivered orders from "
        f"{s['split']['test_from']} to {s['split']['test_to']} "
        f"(model trained on {s['split']['train_orders']} earlier orders).",
        "",
        f"- Platform promise: average {p['mean_promised_days']} days, "
        f"**{p['late_pct']}% late**.",
        f"- At the SAME average length, the quantile model was late "
        f"**{a['model_late_pct']}%** of the time; one fixed window for all orders "
        f"was late {a['global_quantile_late_pct']}%.",
        f"- To reach the platform's late rate, the quantile model needed an average "
        f"promise of **{b['model_mean_promised_days']} days** "
        f"(fixed window: {b['global_quantile_mean_promised_days']} days) "
        f"versus the platform's {p['mean_promised_days']} days.",
        f"- 95% bootstrap interval, late-rate points saved at equal length: "
        f"{ci['late_pct_points_saved_ci95']}; days saved at equal late rate: "
        f"{ci['days_saved_ci95']}.",
    ]
    r = s.get("review_effect_of_platform_lateness")
    if r:
        lines.append(
            f"- Reviews: mean score {r['mean_review_on_time']:.2f} when on time vs "
            f"{r['mean_review_late']:.2f} when late (n={r['orders_with_reviews']})."
        )
    lines += ["", "## Caveats", *[f"- {c}" for c in s["caveats"]], ""]
    return "\n".join(lines)


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--data-dir", type=Path, required=True)
    parser.add_argument("--out", type=Path, default=Path("results"))
    parser.add_argument("--bootstrap", type=int, default=200)
    args = parser.parse_args()
    summary = run(args.data_dir, args.out, args.bootstrap)
    print((args.out / "summary.md").read_text())
