# Delivery promise experiment

Tests whether a data-driven delivery promise (quantile regression) beats the platform's own promise **at the same average promise length**, on the public Olist Brazilian e-commerce data.

## Run it
1. Get the data: https://www.kaggle.com/datasets/olistbr/brazilian-ecommerce (free Kaggle login). Unzip it. You need these files: `olist_orders_dataset.csv`, `olist_order_items_dataset.csv`, `olist_customers_dataset.csv`, `olist_sellers_dataset.csv`, `olist_products_dataset.csv` (and optionally `olist_order_reviews_dataset.csv`). **Do not commit the data**: it is CC BY-NC-SA licensed.
2. `pip install -r requirements.txt`
3. `python run_experiment.py --data-dir <folder with the CSVs> --out results`
4. Read `results/summary.md`; the plot is `results/tradeoff.png`.

`python -m pytest -q` runs the code tests on synthetic data (`make_synthetic.py`). Numbers from synthetic data mean nothing.

## What it measures
- **Late** = delivered after the promised calendar day. All policies use whole days after the purchase day.
- **Time split**: train on the oldest 80% of orders, test on the newest 20%.
- **Policies**: the platform's promised date; one global quantile of past delivery times for every order; a gradient-boosted quantile model per order.
- **Equal-length comparison** from the trade-off curve (interpolated), plus the promise length each policy needs to match the platform's late rate. Bootstrap 95% intervals over test orders.

## Limits (say these out loud)
Brazilian data from 2016 to 2018; a single chronological split; order-level features only (no carrier or route data); interpolation on a curve built from 11 quantiles; the platform's date may deliberately include a safety margin that a pure accuracy comparison ignores.

## Related published work
- Salari, N., Liu, S., Shen, Z.-J. M. (2022). *Real-Time Delivery Time Forecasting and Promising in Online Retailing: When Will Your Package Arrive?* Manufacturing & Service Operations Management. https://doi.org/10.1287/msom.2022.1081
- Zhang, L. et al. (2023). *Delivery Time Prediction Using Large-Scale Graph Structure Learning Based on Quantile Regression.* IEEE. https://ieeexplore.ieee.org/document/10184659/
- Preethi V., Sundaram N., Tallamraju R. B. (2021). *Online Fashion Commerce: Modelling Customer Promise Date.* arXiv:2105.00315 (authors at Myntra Designs; SDM Data Science for Retail and E-Commerce Workshop, 2021).

Commercial merchant-side tools for data-driven promise dates and promise-attainment tracking also exist (for example parcelLab Promise), so this project is not claiming a new idea.
