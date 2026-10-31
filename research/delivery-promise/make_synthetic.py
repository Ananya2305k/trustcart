"""Writes SYNTHETIC CSVs in the Olist file format, for testing the code only.

The numbers produced from this data mean nothing. Run the experiment on the
real Olist files (see README) to get results.
"""
import argparse
from pathlib import Path

import numpy as np
import pandas as pd

STATES = ["SP", "RJ", "MG", "RS", "BA", "PR", "SC", "PE", "CE", "GO"]
CATEGORIES = ["toys", "health_beauty", "sports", "furniture", "computers", "garden"]


def make(out_dir: Path, n: int = 12000, seed: int = 0) -> None:
    rng = np.random.default_rng(seed)
    out_dir.mkdir(parents=True, exist_ok=True)

    seller_ids = [f"s{i}" for i in range(60)]
    sellers = pd.DataFrame({"seller_id": seller_ids, "seller_state": rng.choice(STATES, 60)})
    product_ids = [f"p{i}" for i in range(80)]
    products = pd.DataFrame(
        {
            "product_id": product_ids,
            "product_category_name": rng.choice(CATEGORIES, 80),
            "product_weight_g": rng.integers(100, 8000, 80),
        }
    )
    customers = pd.DataFrame(
        {"customer_id": [f"c{i}" for i in range(n)], "customer_state": rng.choice(STATES, n)}
    )

    start = pd.Timestamp("2017-01-01")
    purchase = start + pd.to_timedelta(rng.uniform(0, 600 * 24 * 3600, n), unit="s")
    purchase = pd.Series(purchase).sort_values().reset_index(drop=True)

    order_seller = rng.choice(seller_ids, n)
    seller_state = sellers.set_index("seller_id").loc[order_seller, "seller_state"].to_numpy()
    same = customers["customer_state"].to_numpy() == seller_state
    base = np.where(same, 4.0, 9.0) + rng.integers(0, 4, n)
    actual = base * rng.lognormal(0, 0.28, n)
    delivered = purchase + pd.to_timedelta(actual * 24 * 3600, unit="s")

    # A deliberately padded, order-agnostic promise (about 8% end up late).
    promised_days = np.round(np.where(same, 13.0, 21.0) + rng.integers(-2, 5, n))
    estimated = (purchase + pd.to_timedelta(promised_days, unit="D")).dt.normalize()

    orders = pd.DataFrame(
        {
            "order_id": [f"o{i}" for i in range(n)],
            "customer_id": customers["customer_id"],
            "order_status": "delivered",
            "order_purchase_timestamp": purchase,
            "order_delivered_customer_date": delivered,
            "order_estimated_delivery_date": estimated,
        }
    )
    items = pd.DataFrame(
        {
            "order_id": orders["order_id"],
            "order_item_id": 1,
            "product_id": rng.choice(product_ids, n),
            "seller_id": order_seller,
            "price": rng.uniform(10, 300, n).round(2),
            "freight_value": rng.uniform(5, 50, n).round(2),
        }
    )
    late = delivered.dt.normalize() > estimated
    reviews = pd.DataFrame(
        {
            "order_id": orders["order_id"],
            "review_score": np.where(late, rng.integers(1, 4, n), rng.integers(3, 6, n)),
        }
    )

    orders.to_csv(out_dir / "olist_orders_dataset.csv", index=False)
    items.to_csv(out_dir / "olist_order_items_dataset.csv", index=False)
    customers.to_csv(out_dir / "olist_customers_dataset.csv", index=False)
    sellers.to_csv(out_dir / "olist_sellers_dataset.csv", index=False)
    products.to_csv(out_dir / "olist_products_dataset.csv", index=False)
    reviews.to_csv(out_dir / "olist_order_reviews_dataset.csv", index=False)


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--out", type=Path, default=Path("synthetic_data"))
    parser.add_argument("--n", type=int, default=12000)
    args = parser.parse_args()
    make(args.out, args.n)
    print(f"Wrote SYNTHETIC test data to {args.out} (not real; for code testing only)")
