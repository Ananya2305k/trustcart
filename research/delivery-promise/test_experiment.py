import json

import numpy as np
import pytest

import run_experiment as ex
from make_synthetic import make


@pytest.fixture(scope="module")
def data_dir(tmp_path_factory):
    path = tmp_path_factory.mktemp("synthetic")
    make(path, n=4000)
    return path


def test_time_split_never_trains_on_the_future(data_dir):
    df, _ = ex.load_orders(data_dir)
    train, test = ex.time_split(df)
    assert train["order_purchase_timestamp"].max() <= test["order_purchase_timestamp"].min()
    assert len(train) + len(test) == len(df)


def test_encoder_maps_unseen_categories_to_nan(data_dir):
    df, _ = ex.load_orders(data_dir)
    train, _ = ex.time_split(df)
    enc = ex.Encoder().fit(train)
    probe = train.head(2).copy()
    probe["customer_state"] = ["ZZ", train["customer_state"].iloc[1]]
    x = enc.transform(probe)
    assert np.isnan(x[0, 0]) and not np.isnan(x[1, 0])


def test_curve_helpers_interpolate_correctly():
    curve = np.array([[5.0, 40.0], [10.0, 20.0], [20.0, 5.0]])
    assert ex.late_at_length(curve, 10.0) == pytest.approx(20.0)
    assert ex.late_at_length(curve, 7.5) == pytest.approx(30.0)
    assert ex.length_at_late(curve, 20.0) == pytest.approx(10.0)
    assert ex.length_at_late(curve, 12.5) == pytest.approx(15.0)


def test_curve_point_counts_late_correctly():
    actual = np.array([3, 5, 7, 9])
    promised = np.array([5, 5, 5, 5])
    mean_days, late_pct = ex.curve_point(actual, promised)
    assert mean_days == 5 and late_pct == 50.0  # 7 and 9 are late; 5 is on time


def test_predicted_promises_never_decrease_with_quantile(data_dir):
    df, _ = ex.load_orders(data_dir)
    train, test = ex.time_split(df)
    enc = ex.Encoder().fit(train)
    qs = [0.5, 0.8, 0.95]
    models = ex.fit_quantile_models(
        enc.transform(train), train["actual_days"].to_numpy(float), enc.categorical_mask, qs
    )
    matrix = ex.predict_promises(models, enc.transform(test), qs)
    assert (np.diff(matrix, axis=1) >= 0).all()


def test_full_run_writes_outputs(data_dir, tmp_path):
    summary = ex.run(data_dir, tmp_path / "out", n_boot=10)
    for name in ("results.json", "tradeoff.png", "summary.md"):
        assert (tmp_path / "out" / name).exists()
    saved = json.loads((tmp_path / "out" / "results.json").read_text())
    assert saved["split"]["test_orders"] == summary["split"]["test_orders"]
    assert 0 <= saved["platform"]["late_pct"] <= 100
    assert "caveats" in saved
