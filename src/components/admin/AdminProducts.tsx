import { useCallback, useEffect, useState } from "react";
import type { FormEvent } from "react";
import { apiRequest, authHeaders, errorMessage } from "../../lib/api";
import { inr } from "../../lib/format";
import type { Product } from "../../lib/types";

function ProductRow({
  product,
  token,
  onUpdated,
}: {
  product: Product;
  token: string;
  onUpdated: (product: Product) => void;
}) {
  const [price, setPrice] = useState(String(product.price));
  const [stock, setStock] = useState(String(product.stock));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function save(update: Record<string, unknown>) {
    setBusy(true);
    setError("");
    try {
      const res = await apiRequest<{ product: Product }>(
        `/admin/products/${product._id}`,
        {
          method: "PATCH",
          headers: authHeaders(token),
          body: JSON.stringify(update),
        }
      );
      onUpdated(res.product);
    } catch (err) {
      setError(errorMessage(err, "Could not save."));
    } finally {
      setBusy(false);
    }
  }

  return (
    <tr className={product.isActive ? "" : "inactive"}>
      <td>
        <strong>{product.name}</strong>
        <small>{product.category}</small>
        {error && <small className="tc-error-text">{error}</small>}
      </td>
      <td>
        <input
          type="number"
          min={0}
          aria-label={`Price for ${product.name}`}
          value={price}
          onChange={(e) => setPrice(e.target.value)}
        />
        <small>{inr(product.price)}</small>
      </td>
      <td>
        <input
          type="number"
          min={0}
          step={1}
          aria-label={`Stock for ${product.name}`}
          value={stock}
          onChange={(e) => setStock(e.target.value)}
        />
      </td>
      <td className="tc-actions">
        <button
          type="button"
          className="tc-btn"
          disabled={busy}
          onClick={() => void save({ price: Number(price), stock: Number(stock) })}
        >
          Save
        </button>
        <button
          type="button"
          className="tc-btn ghost"
          disabled={busy}
          onClick={() => void save({ isActive: !product.isActive })}
        >
          {product.isActive ? "Hide" : "Show"}
        </button>
      </td>
    </tr>
  );
}

export default function AdminProducts({ token }: { token: string }) {
  const [products, setProducts] = useState<Product[]>([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState({
    name: "",
    description: "",
    category: "",
    price: "",
    stock: "",
  });

  const load = useCallback(async () => {
    try {
      const res = await apiRequest<{ products: Product[] }>("/admin/products", {
        headers: authHeaders(token),
      });
      setProducts(res.products);
    } catch (err) {
      setError(errorMessage(err, "Unable to load products."));
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    void load();
  }, [load]);

  async function create(event: FormEvent) {
    event.preventDefault();
    setError("");
    try {
      const res = await apiRequest<{ product: Product }>("/admin/products", {
        method: "POST",
        headers: authHeaders(token),
        body: JSON.stringify({
          ...form,
          price: Number(form.price),
          stock: Number(form.stock),
        }),
      });
      setProducts((prev) => [res.product, ...prev]);
      setForm({ name: "", description: "", category: "", price: "", stock: "" });
    } catch (err) {
      setError(errorMessage(err, "Could not add the product."));
    }
  }

  const set = (key: keyof typeof form) => (e: { target: { value: string } }) =>
    setForm((prev) => ({ ...prev, [key]: e.target.value }));

  return (
    <div>
      {error && (
        <p className="tc-error" role="alert">
          {error}
        </p>
      )}

      <form className="tc-card tc-form" onSubmit={create}>
        <h3>Add product</h3>
        <div className="tc-grid-2">
          <label>
            Name
            <input required value={form.name} onChange={set("name")} />
          </label>
          <label>
            Category
            <input required value={form.category} onChange={set("category")} />
          </label>
          <label>
            Price (₹)
            <input required type="number" min={0} value={form.price} onChange={set("price")} />
          </label>
          <label>
            Stock
            <input required type="number" min={0} step={1} value={form.stock} onChange={set("stock")} />
          </label>
        </div>
        <label>
          Description
          <textarea required rows={2} value={form.description} onChange={set("description")} />
        </label>
        <button className="tc-btn" type="submit">
          Add product
        </button>
      </form>

      {loading ? (
        <p>Loading products...</p>
      ) : (
        <div className="tc-table-wrap">
          <table className="tc-table">
            <thead>
              <tr>
                <th>Product</th>
                <th>Price</th>
                <th>Stock</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {products.map((product) => (
                <ProductRow
                  key={product._id}
                  product={product}
                  token={token}
                  onUpdated={(updated) =>
                    setProducts((prev) =>
                      prev.map((p) => (p._id === updated._id ? updated : p))
                    )
                  }
                />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
