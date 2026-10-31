import { useCallback, useEffect, useState } from "react";
import type { FormEvent } from "react";
import {
  Minus,
  Plus,
  ShoppingBag,
  Trash2,
  Truck,
  CheckCircle,
} from "lucide-react";
import { apiRequest } from "../lib/api";
import PromiseStats from "./PromiseStats";

interface CartProduct {
  _id: string;
  name: string;
  price: number;
  image?: string;
  imageUrl?: string;
  images?: string[];
  stock: number;
}

interface CartItem {
  product: CartProduct;
  quantity: number;
}

interface CartData {
  items: CartItem[];
  subtotal: number;
  totalItems: number;
}

interface CartResponse {
  success?: boolean;
  data?: CartData | { cart: CartData };
  items?: CartItem[];
  subtotal?: number;
  totalItems?: number;
  message?: string;
}

interface CartProps {
  token: string;
}

interface ShippingForm {
  fullName: string;
  phone: string;
  houseNumber: string;
  street: string;
  area: string;
  landmark: string;
  city: string;
  state: string;
  postalCode: string;
  country: string;
}

interface CheckoutOrder {
  _id?: string;
  orderNumber?: string;
}

interface CheckoutResponse {
  success?: boolean;
  message?: string;
  order?: CheckoutOrder;
  data?: {
    order?: CheckoutOrder;
    _id?: string;
    orderNumber?: string;
  };
}

const initialShipping: ShippingForm = {
  fullName: "",
  phone: "",
  houseNumber: "",
  street: "",
  area: "",
  landmark: "",
  city: "",
  state: "",
  postalCode: "",
  country: "India",
};

export default function Cart({ token }: CartProps) {
  const [cart, setCart] = useState<CartData>({
    items: [],
    subtotal: 0,
    totalItems: 0,
  });
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState("");
  const [error, setError] = useState("");
  const [checkoutOpen, setCheckoutOpen] = useState(false);
  const [shipping, setShipping] = useState<ShippingForm>(initialShipping);
  const [checkingOut, setCheckingOut] = useState(false);
  const [confirmedOrder, setConfirmedOrder] =
    useState<CheckoutResponse | null>(null);

  const loadCart = useCallback(async () => {
    setError("");

    try {
      const response = await apiRequest<CartResponse>("/cart", {
        headers: { Authorization: `Bearer ${token}` },
      });

      const raw = response.data;
      const data = raw && "cart" in raw ? raw.cart : raw;

      const items = data?.items ?? response.items ?? [];

      // The API returns `total`; compute from items so the figure is always right.
      setCart({
        items,
        subtotal: items.reduce(
          (sum, item) => sum + item.product.price * item.quantity,
          0
        ),
        totalItems: items.reduce((sum, item) => sum + item.quantity, 0),
      });
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Could not load your cart."
      );
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    void loadCart();
  }, [loadCart]);

  async function updateQuantity(productId: string, quantity: number) {
    if (quantity < 1) return;

    setBusyId(productId);
    setError("");

    try {
      await apiRequest(`/cart/items/${productId}`, {
        method: "PATCH",
        headers: { Authorization: `Bearer ${token}` },
        body: JSON.stringify({ quantity }),
      });

      await loadCart();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Could not update quantity."
      );
    } finally {
      setBusyId("");
    }
  }

  async function removeItem(productId: string) {
    setBusyId(productId);
    setError("");

    try {
      await apiRequest(`/cart/items/${productId}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });

      await loadCart();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Could not remove this item."
      );
    } finally {
      setBusyId("");
    }
  }

  function updateShipping(field: keyof ShippingForm, value: string) {
    setShipping((previous) => ({ ...previous, [field]: value }));
  }

  async function placeOrder(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setCheckingOut(true);

    const addressLine = [
      shipping.houseNumber,
      shipping.street,
      shipping.area,
      shipping.landmark,
    ]
      .map((part) => part.trim())
      .filter(Boolean)
      .join(", ");

    try {
      const response = await apiRequest<CheckoutResponse>(
        "/orders/checkout",
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            fullName: shipping.fullName.trim(),
            phone: shipping.phone.trim(),
            addressLine,
            city: shipping.city.trim(),
            state: shipping.state.trim(),
            postalCode: shipping.postalCode.trim(),
            country: shipping.country.trim(),
          }),
        }
      );

      setConfirmedOrder(response);
      setCheckoutOpen(false);
      setShipping(initialShipping);
      await loadCart();
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Checkout failed. Please try again."
      );
    } finally {
      setCheckingOut(false);
    }
  }

  if (loading) {
    return <section className="cart-panel">Loading your cart...</section>;
  }

  if (confirmedOrder) {
    const order =
      confirmedOrder.order ??
      confirmedOrder.data?.order ??
      confirmedOrder.data;

    const orderNumber = order?.orderNumber ?? order?._id;

    return (
      <section className="cart-panel checkout-success">
        <CheckCircle size={54} />
        <h2>Order placed successfully!</h2>
        <p>
          Your order has been received. You can view its status in My Orders.
        </p>

        {orderNumber && (
          <p>
            <strong>Order ID:</strong> {orderNumber}
          </p>
        )}

        <button
          type="button"
          className="cart-checkout-button"
          onClick={() => setConfirmedOrder(null)}
        >
          Continue shopping
        </button>
      </section>
    );
  }

  return (
    <section className="cart-panel">
      <div className="cart-heading">
        <div>
          <h2>Your Shopping Cart</h2>
          <p>
            {cart.totalItems} {cart.totalItems === 1 ? "item" : "items"} in your cart
          </p>
        </div>
        <ShoppingBag size={28} />
      </div>

      {error && <p className="cart-error">{error}</p>}

      {cart.items.length === 0 ? (
        <div className="cart-empty">
          <ShoppingBag size={44} />
          <h3>Your cart is empty</h3>
          <p>Explore the products and add something you like.</p>
        </div>
      ) : (
        <>
          <div className="cart-items">
            {cart.items.map((item) => {
              const product = item.product;
              const productId = product._id;
              const image =
                product.imageUrl || product.image || product.images?.[0];

              return (
                <article className="cart-item" key={productId}>
                  {image ? (
                    <img src={image} alt={product.name} />
                  ) : (
                    <div className="cart-image-placeholder">
                      <ShoppingBag size={24} />
                    </div>
                  )}

                  <div className="cart-item-info">
                    <h3>{product.name}</h3>
                    <p>₹{product.price.toLocaleString("en-IN")} each</p>

                    <div className="cart-quantity">
                      <button
                        type="button"
                        aria-label="Decrease quantity"
                        disabled={busyId === productId || item.quantity <= 1}
                        onClick={() =>
                          void updateQuantity(productId, item.quantity - 1)
                        }
                      >
                        <Minus size={15} />
                      </button>

                      <span>{item.quantity}</span>

                      <button
                        type="button"
                        aria-label="Increase quantity"
                        disabled={
                          busyId === productId ||
                          item.quantity >= product.stock
                        }
                        onClick={() =>
                          void updateQuantity(productId, item.quantity + 1)
                        }
                      >
                        <Plus size={15} />
                      </button>

                      <button
                        type="button"
                        className="cart-remove"
                        aria-label={`Remove ${product.name}`}
                        disabled={busyId === productId}
                        onClick={() => void removeItem(productId)}
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>
                  </div>

                  <strong>
                    ₹{(product.price * item.quantity).toLocaleString("en-IN")}
                  </strong>
                </article>
              );
            })}
          </div>

          <div className="cart-summary">
            <div>
              <span>Subtotal</span>
              <strong>₹{cart.subtotal.toLocaleString("en-IN")}</strong>
            </div>

            <p>
              Shipping is free for orders of ₹1,000 or more; otherwise ₹50.
            </p>

            <PromiseStats compact />

            {!checkoutOpen ? (
              <button
                type="button"
                className="cart-checkout-button"
                onClick={() => setCheckoutOpen(true)}
              >
                <Truck size={18} /> Continue to checkout
              </button>
            ) : (
              <form className="checkout-form" onSubmit={placeOrder}>
                <h3>Shipping Details</h3>

                <label>
                  Full name
                  <input
                    required
                    value={shipping.fullName}
                    onChange={(e) => updateShipping("fullName", e.target.value)}
                    autoComplete="name"
                  />
                </label>

                <label>
                  Phone number
                  <input
                    required
                    type="tel"
                    inputMode="numeric"
                    pattern="[0-9]{10}"
                    title="Enter a 10-digit phone number"
                    value={shipping.phone}
                    onChange={(e) => updateShipping("phone", e.target.value)}
                    autoComplete="tel"
                  />
                </label>

                <label>
                  House / Flat / Building number
                  <input
                    required
                    value={shipping.houseNumber}
                    onChange={(e) =>
                      updateShipping("houseNumber", e.target.value)
                    }
                    autoComplete="address-line1"
                  />
                </label>

                <label>
                  Street / Road
                  <input
                    required
                    value={shipping.street}
                    onChange={(e) => updateShipping("street", e.target.value)}
                    autoComplete="address-line2"
                  />
                </label>

                <label>
                  Area / Locality
                  <input
                    required
                    value={shipping.area}
                    onChange={(e) => updateShipping("area", e.target.value)}
                  />
                </label>

                <label>
                  Landmark (optional)
                  <input
                    value={shipping.landmark}
                    onChange={(e) =>
                      updateShipping("landmark", e.target.value)
                    }
                  />
                </label>

                <div className="checkout-grid">
                  <label>
                    City
                    <input
                      required
                      value={shipping.city}
                      onChange={(e) => updateShipping("city", e.target.value)}
                      autoComplete="address-level2"
                    />
                  </label>

                  <label>
                    State
                    <input
                      required
                      value={shipping.state}
                      onChange={(e) => updateShipping("state", e.target.value)}
                      autoComplete="address-level1"
                    />
                  </label>

                  <label>
                    PIN code
                    <input
                      required
                      inputMode="numeric"
                      pattern="[0-9]{6}"
                      title="Enter a 6-digit PIN code"
                      value={shipping.postalCode}
                      onChange={(e) =>
                        updateShipping("postalCode", e.target.value)
                      }
                      autoComplete="postal-code"
                    />
                  </label>

                  <label>
                    Country
                    <input
                      required
                      value={shipping.country}
                      onChange={(e) =>
                        updateShipping("country", e.target.value)
                      }
                      autoComplete="country-name"
                    />
                  </label>
                </div>

                <button
                  type="submit"
                  className="cart-checkout-button"
                  disabled={checkingOut}
                >
                  {checkingOut ? "Placing order..." : "Place Order"}
                </button>

                <button
                  type="button"
                  className="checkout-cancel-button"
                  disabled={checkingOut}
                  onClick={() => setCheckoutOpen(false)}
                >
                  Back to cart
                </button>
              </form>
            )}
          </div>
        </>
      )}
    </section>
  );
}
