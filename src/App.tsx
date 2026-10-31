import { useEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import Cart from './components/Cart'
import Orders from './components/Orders'
import Refunds from './components/Refunds'
import Support from './components/Support'
import Admin from './components/Admin'
import PromiseStats from './components/PromiseStats'

import {
  ArrowDownRight, ArrowRight, ArrowUpRight, Check,
  CircleHelp, Headphones, LayoutDashboard,
  LogOut, Menu, Package, Search, Settings, ShieldCheck, ShoppingBag,
  ShoppingCart, Truck, WalletCards, X
} from 'lucide-react'

import Auth from './components/Auth'
import { apiRequest, authHeaders } from './lib/api'
import { ORDER_STEPS, fmtDate, fmtDateTime, inr, shortId, statusTone } from './lib/format'
import type { Order, Refund, Ticket } from './lib/types'

type Tab =
  | 'Overview'
  | 'Shopping Cart'
  | 'My orders'
  | 'Returns & refunds'
  | 'Help & support'
  | 'Admin'

type AuthUser = {
  id: string
  name: string
  email: string
  role: string
}

type AuthMeResponse = {
  success: boolean
  data?: AuthUser
  user?: AuthUser
}

type Product = {
  _id: string
  name: string
  description: string
  price: number
  category: string
  imageUrl: string
  stock: number
  isActive: boolean
}

type ProductsResponse = {
  success: boolean
  data: Product[]
  pagination: {
    total: number
    page: number
    limit: number
    totalPages: number
  }
}

const navItems: { label: Tab; icon: typeof LayoutDashboard }[] = [
  { label: 'Overview', icon: LayoutDashboard },
  { label: 'Shopping Cart', icon: ShoppingCart },
  { label: 'My orders', icon: Package },
  { label: 'Returns & refunds', icon: WalletCards },
  { label: 'Help & support', icon: Headphones },
]

const adminNavItem: { label: Tab; icon: typeof LayoutDashboard } = {
  label: 'Admin',
  icon: Settings,
}

function getInitials(name: string) {
  return name
    .trim()
    .split(/\s+/)
    .map(part => part[0])
    .join('')
    .slice(0, 2)
    .toUpperCase()
}

function App() {
  const [active, setActive] = useState<Tab>('Overview')
  const [mobileNav, setMobileNav] = useState(false)
  const [query, setQuery] = useState('')
  const [searchTerm, setSearchTerm] = useState('')
  const searchRef = useRef<HTMLInputElement>(null)

  const [token, setToken] = useState<string | null>(
    () => localStorage.getItem('trustcart_token')
  )
  const [user, setUser] = useState<AuthUser | null>(null)
  const [authChecking, setAuthChecking] = useState(true)

  const [products, setProducts] = useState<Product[]>([])
  const [productsLoading, setProductsLoading] = useState(false)
  const [productsError, setProductsError] = useState('')
  const [addingProductId, setAddingProductId] = useState<string | null>(null)

  const [orders, setOrders] = useState<Order[]>([])
  const [refunds, setRefunds] = useState<Refund[]>([])
  const [tickets, setTickets] = useState<Ticket[]>([])
  const [refundOrderId, setRefundOrderId] = useState<string | undefined>()
  const [supportOrderId, setSupportOrderId] = useState<string | undefined>()
  const [notice, setNotice] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null)

  function showNotice(kind: 'ok' | 'error', text: string) {
    setNotice({ kind, text })
    window.setTimeout(() => setNotice(null), 3500)
  }

  // Verify an existing login when the app opens.
  useEffect(() => {
    if (!token) {
      setAuthChecking(false)
      return
    }

    let cancelled = false

    async function verifySession() {
      try {
        const response = await apiRequest<AuthMeResponse>('/auth/me', {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        })

        const currentUser = response.user ?? response.data

        if (!currentUser) {
          throw new Error('Unable to verify your account.')
        }

        if (!cancelled) {
          setUser(currentUser)
        }
      } catch {
        if (!cancelled) {
          localStorage.removeItem('trustcart_token')
          setToken(null)
          setUser(null)
        }
      } finally {
        if (!cancelled) {
          setAuthChecking(false)
        }
      }
    }

    void verifySession()

    return () => {
      cancelled = true
    }
  }, [token])

  // Debounce the search box so we don't call the API on every keystroke.
  useEffect(() => {
    const timer = window.setTimeout(() => setSearchTerm(query.trim()), 300)
    return () => window.clearTimeout(timer)
  }, [query])

  // Ctrl+K (or Cmd+K) focuses the search box.
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault()
        searchRef.current?.focus()
      }
    }

    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [])

  // Fetch products after the user is authenticated (and when searching).
  useEffect(() => {
    if (!token || !user) return

    let cancelled = false

    async function loadProducts() {
      setProductsLoading(true)
      setProductsError('')

      try {
        const response = await apiRequest<ProductsResponse>(
          `/products?limit=12${searchTerm ? `&search=${encodeURIComponent(searchTerm)}` : ''}`,
          {
            headers: {
              Authorization: `Bearer ${token}`,
            },
          }
        )

        if (!cancelled) {
          setProducts(response.data)
        }
      } catch (error) {
        if (!cancelled) {
          setProductsError(
            error instanceof Error
              ? error.message
              : 'Unable to load products.'
          )
        }
      } finally {
        if (!cancelled) {
          setProductsLoading(false)
        }
      }
    }

    void loadProducts()

    return () => {
      cancelled = true
    }
  }, [token, user, searchTerm])

  // Real order / refund / ticket data for the overview and sidebar badge.
  useEffect(() => {
    if (!token || !user || active === 'Admin') return

    let cancelled = false

    async function loadOverview() {
      try {
        const [orderRes, refundRes, ticketRes] = await Promise.all([
          apiRequest<{ orders: Order[] }>('/orders', { headers: authHeaders(token!) }),
          apiRequest<{ refunds: Refund[] }>('/refunds', { headers: authHeaders(token!) }),
          apiRequest<{ tickets: Ticket[] }>('/tickets', { headers: authHeaders(token!) }),
        ])

        if (!cancelled) {
          setOrders(orderRes.orders)
          setRefunds(refundRes.refunds)
          setTickets(ticketRes.tickets)
        }
      } catch {
        // The overview still renders; individual screens show their own errors.
      }
    }

    void loadOverview()

    return () => {
      cancelled = true
    }
  }, [token, user, active])

  function handleAuthenticated(
    newToken: string,
    authenticatedUser: AuthUser
  ) {
    localStorage.setItem('trustcart_token', newToken)
    setUser(authenticatedUser)
    setToken(newToken)
    setActive('Overview')
  }

  function handleLogout() {
    localStorage.removeItem('trustcart_token')
    setToken(null)
    setUser(null)
    setProducts([])
    setProductsError('')
    setOrders([])
    setRefunds([])
    setTickets([])
    setActive('Overview')
    setQuery('')
  }

  // Add a product to the authenticated user's server-side cart.
  async function handleAddToCart(product: Product) {
    if (!token || product.stock <= 0 || addingProductId) return

    setAddingProductId(product._id)

    try {
      await apiRequest('/cart/items', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          productId: product._id,
          quantity: 1,
        }),
      })

      showNotice('ok', `${product.name} added to your cart.`)
    } catch (error) {
      showNotice(
        'error',
        error instanceof Error
          ? error.message
          : 'Unable to add product to cart.'
      )
    } finally {
      setAddingProductId(null)
    }
  }

  const activeOrders = orders.filter(o =>
    ['Placed', 'Confirmed', 'Shipped'].includes(o.orderStatus)
  )
  const refundsInProgress = refunds.filter(r =>
    ['Requested', 'Under review', 'Approved'].includes(r.status)
  )
  const openTickets = tickets.filter(t =>
    ['Open', 'In progress'].includes(t.status)
  )
  const needle = query.trim().toLowerCase()
  const recentOrders = orders
    .filter(o =>
      !needle ||
      `${shortId(o._id)} ${o.items.map(i => i.name).join(' ')}`
        .toLowerCase()
        .includes(needle)
    )
    .slice(0, 3)
  const journeyOrder =
    activeOrders[0] ?? orders.find(o => o.orderStatus === 'Delivered')

  if (authChecking) {
    return <div className="auth-loading">Checking your session...</div>
  }

  if (!token || !user) {
    return <Auth onAuthenticated={handleAuthenticated} />
  }

  return (
    <div className="app-shell">
      <aside className={`sidebar ${mobileNav ? 'sidebar-open' : ''}`}>
        <div className="brand-row">
          <div className="brand-mark">
            <ShieldCheck size={22} strokeWidth={2.4} />
          </div>

          <span className="brand-name">
            trust<span>cart</span>
          </span>

          <button
            className="icon-button close-nav"
            aria-label="Close navigation"
            onClick={() => setMobileNav(false)}
          >
            <X size={19} />
          </button>
        </div>

        <div className="workspace-label">YOUR SPACE</div>

        <nav className="main-nav" aria-label="Main navigation">
          {(user.role === 'admin' ? [...navItems, adminNavItem] : navItems).map(({ label, icon: Icon }) => (
            <button
              key={label}
              className={`nav-item ${active === label ? 'active' : ''}`}
              onClick={() => {
                setActive(label)
                setMobileNav(false)
              }}
            >
              <Icon size={18} strokeWidth={1.9} />
              <span>{label}</span>

              {label === 'Help & support' && openTickets.length > 0 && (
                <span className="nav-count">{openTickets.length}</span>
              )}
            </button>
          ))}
        </nav>

        <div className="sidebar-bottom">
          <div className="trust-card">
            <div className="trust-icon">
              <ShieldCheck size={18} />
            </div>
            <strong>Shopping, with clarity.</strong>
            <p>Every update. Every decision. Clearly explained.</p>
          </div>

          <div className="profile-row">
            <div className="avatar">{getInitials(user.name)}</div>

            <div className="profile-copy">
              <strong>{user.name}</strong>
              <span>{user.role === 'admin' ? 'Admin account' : 'Customer account'}</span>
            </div>

            <button
              className="icon-button"
              aria-label="Sign out"
              title="Sign out"
              onClick={handleLogout}
            >
              <LogOut size={17} />
            </button>
          </div>
        </div>
      </aside>

      {mobileNav && (
        <button
          className="mobile-scrim"
          aria-label="Close menu overlay"
          onClick={() => setMobileNav(false)}
        />
      )}

      <main className="main-area">
        <header className="topbar">
          <button
            className="icon-button mobile-menu"
            aria-label="Open navigation"
            onClick={() => setMobileNav(true)}
          >
            <Menu size={21} />
          </button>

          <div className="breadcrumb">
            My account <span>/</span> <strong>{active}</strong>
          </div>

          <div className="top-actions">
            <label className="search-box">
              <Search size={17} />
              <input
                ref={searchRef}
                value={query}
                onChange={event => {
                  setQuery(event.target.value)

                  // Results live on the Overview, so jump there while typing.
                  if (event.target.value.trim() && active !== 'Overview') {
                    setActive('Overview')
                  }
                }}
                onKeyDown={event => {
                  if (event.key === 'Escape') {
                    setQuery('')
                    event.currentTarget.blur()
                  }
                }}
                placeholder="Search products and orders..."
                aria-label="Search products and orders"
              />
              {query ? (
                <button
                  type="button"
                  className="search-clear"
                  aria-label="Clear search"
                  onClick={() => setQuery('')}
                >
                  <X size={14} />
                </button>
              ) : (
                <kbd>
                  {/Mac|iPhone|iPad/.test(navigator.platform) ? '⌘ K' : 'Ctrl K'}
                </kbd>
              )}
            </label>

            <div className="top-avatar">{getInitials(user.name)}</div>
          </div>
        </header>

        <div className="page-content">
          <div className="welcome-row">
            <div>
              <div className="eyebrow">
                <span className="eyebrow-dot" /> YOUR TRUSTCART ACCOUNT
              </div>

              <h1>
                {active === 'Overview'
                  ? `Good to see you, ${user.name.split(' ')[0]}`
                  : active}
              </h1>

              <p className="page-subtitle">
                {active === 'Overview'
                  ? 'Here’s what’s happening with your orders today.'
                  : sectionSubtitle(active)}
              </p>
            </div>

            {active !== 'Help & support' && (
              <button
                className="secondary-button"
                onClick={() => setActive('Help & support')}
              >
                <CircleHelp size={17} /> Get help
              </button>
            )}
          </div>

          {notice && (
            <div
              className={`tc-toast ${notice.kind}`}
              role={notice.kind === 'error' ? 'alert' : 'status'}
            >
              {notice.text}
            </div>
          )}

          {active === 'Shopping Cart' ? (
            <Cart token={token} />
          ) : active === 'My orders' ? (
            <Orders
              token={token}
              onRequestRefund={id => {
                setRefundOrderId(id)
                setActive('Returns & refunds')
              }}
              onAskSupport={id => {
                setSupportOrderId(id)
                setActive('Help & support')
              }}
            />
          ) : active === 'Returns & refunds' ? (
            <Refunds token={token} initialOrderId={refundOrderId} />
          ) : active === 'Help & support' ? (
            <Support token={token} initialOrderId={supportOrderId} />
          ) : active === 'Admin' && user.role === 'admin' ? (
            <Admin token={token} />
          ) : (
            <>
              <section className="hero-banner">
                <div className="hero-copy">
                  <div className="hero-tag">
                    <ShieldCheck size={14} /> THE TRUSTCART PROMISE
                  </div>

                  <h2>
                    Know where things stand.
                    <br />
                    <span>Every step of the way.</span>
                  </h2>

                  <p>
                    Clear updates on your orders, honest refund timelines,
                    and support that keeps you in the loop.
                  </p>

                  <button
                    className="hero-button"
                    onClick={() => setActive('My orders')}
                  >
                    Track your orders <ArrowRight size={17} />
                  </button>
                </div>

                <div className="hero-art" aria-hidden="true">
                  <div className="art-orbit orbit-one" />
                  <div className="art-orbit orbit-two" />
                  <div className="parcel parcel-back" />
                  <div className="parcel parcel-front">
                    <span />
                    <b>TC</b>
                  </div>
                  <div className="float-chip chip-check">
                    <Check size={15} /> Order confirmed
                  </div>
                  <div className="float-chip chip-truck">
                    <Truck size={16} /> On the way
                  </div>
                  <div className="float-dot dot-one" />
                  <div className="float-dot dot-two" />
                </div>
              </section>

              <section className="stats-grid" aria-label="Order summary">
                <StatCard
                  icon={<Package size={19} />}
                  label="Active orders"
                  value={String(activeOrders.length)}
                  detail={`${orders.filter(o => o.orderStatus === 'Shipped').length} shipped`}
                  tone="blue"
                />

                <StatCard
                  icon={<WalletCards size={19} />}
                  label="Refunds in progress"
                  value={String(refundsInProgress.length)}
                  detail="Every stage is timestamped"
                  tone="amber"
                />

                <StatCard
                  icon={<Headphones size={19} />}
                  label="Open support tickets"
                  value={String(openTickets.length)}
                  detail="All updates in one place"
                  tone="purple"
                />
              </section>

              <PromiseStats />

              <section className="panel products-panel">
                <div className="panel-heading">
                  <div>
                    <h3>
                      {searchTerm ? `Results for “${searchTerm}”` : 'Explore products'}
                    </h3>
                    <p>
                      {searchTerm
                        ? `${products.length} matching ${products.length === 1 ? 'product' : 'products'}`
                        : 'Products loaded from your TrustCart database.'}
                    </p>
                  </div>

                  <span className="live-indicator">
                    <i /> Live data
                  </span>
                </div>

                {productsLoading && products.length === 0 ? (
                  <p>Loading products...</p>
                ) : productsError ? (
                  <p role="alert">
                    Could not load products: {productsError}
                  </p>
                ) : products.length === 0 ? (
                  <p>
                    {searchTerm
                      ? `No products match “${searchTerm}”. Try a different word.`
                      : 'No products are available right now.'}
                  </p>
                ) : (
                  <div className="product-grid">
                    {products.map(product => (
                      <article className="catalog-product" key={product._id}>
                        <div className="catalog-image">
                          {product.imageUrl ? (
                            <img src={product.imageUrl} alt={product.name} />
                          ) : (
                            <ShoppingBag size={32} />
                          )}
                        </div>

                        <div className="catalog-product-info">
                          <span className="catalog-category">
                            {product.category}
                          </span>

                          <h4>{product.name}</h4>

                          <p>
                            {product.description.length > 90
                              ? `${product.description.slice(0, 90)}...`
                              : product.description}
                          </p>

                          <div className="catalog-product-bottom">
                            <strong>{inr(product.price)}</strong>

                            <span>
                              {product.stock > 0 ? 'In stock' : 'Out of stock'}
                            </span>
                          </div>

                          <button
                            type="button"
                            className="cart-add-button"
                            disabled={
                              product.stock <= 0 ||
                              addingProductId !== null
                            }
                            onClick={() => void handleAddToCart(product)}
                          >
                            <ShoppingCart size={16} />

                            {product.stock <= 0
                              ? 'Out of stock'
                              : addingProductId === product._id
                                ? 'Adding...'
                                : 'Add to Cart'}
                          </button>
                        </div>
                      </article>
                    ))}
                  </div>
                )}

                <button
                  type="button"
                  className="text-link"
                  onClick={() => setActive('Shopping Cart')}
                >
                  <ShoppingCart size={16} /> Open Shopping Cart
                  <ArrowRight size={15} />
                </button>
              </section>

              <section className="content-grid">
                <div className="panel orders-panel">
                  <div className="panel-heading">
                    <div>
                      <h3>Recent orders</h3>
                      <p>Your latest real orders.</p>
                    </div>

                    <button
                      className="text-link"
                      onClick={() => setActive('My orders')}
                    >
                      View all orders <ArrowRight size={15} />
                    </button>
                  </div>

                  <div className="orders-list">
                    {recentOrders.map(order => {
                      const step = ORDER_STEPS.indexOf(order.orderStatus) + 1
                      const tone = statusTone(order.orderStatus)

                      return (
                        <div className="order-row" key={order._id}>
                          <div className={`product-thumb ${tone}`}>
                            <Package size={20} />
                          </div>

                          <div className="order-main">
                            <div className="order-title-row">
                              <strong>
                                {order.items[0]?.name}
                                {order.items.length > 1
                                  ? ` +${order.items.length - 1} more`
                                  : ''}
                              </strong>
                              <span className={`status-pill ${tone}`}>
                                {order.orderStatus}
                              </span>
                            </div>

                            <span className="order-detail">
                              {order.items.reduce((n, i) => n + i.quantity, 0)} item(s)
                              <span className="dot-separator"> · </span>
                              #{shortId(order._id)}
                            </span>

                            <div
                              className="mini-progress"
                              aria-label={`Order progress step ${step} of 4`}
                            >
                              {[1, 2, 3, 4].map(n => (
                                <span
                                  key={n}
                                  className={n <= step ? 'complete' : ''}
                                />
                              ))}
                            </div>

                            <span className="delivery-date">
                              <Truck size={13} />{' '}
                              {order.orderStatus === 'Delivered'
                                ? 'Delivered'
                                : order.orderStatus === 'Cancelled'
                                  ? 'Cancelled'
                                  : order.estimatedDelivery?.to
                                    ? `Estimated by ${fmtDate(order.estimatedDelivery.to)}`
                                    : 'In progress'}
                            </span>
                          </div>

                          <div className="order-price">
                            {inr(order.total)}
                            <button
                              aria-label={`View order ${shortId(order._id)}`}
                              onClick={() => setActive('My orders')}
                            >
                              <ArrowUpRight size={16} />
                            </button>
                          </div>
                        </div>
                      )
                    })}

                    {orders.length === 0 && (
                      <div className="empty-search">
                        No orders yet. Add something to your cart to place your first one.
                      </div>
                    )}

                    {orders.length > 0 && recentOrders.length === 0 && (
                      <div className="empty-search">
                        No orders match “{query}”. Try another search.
                      </div>
                    )}
                  </div>
                </div>

                <div className="right-column">
                  <div className="panel timeline-panel">
                    <div className="panel-heading">
                      <div>
                        <h3>Order journey</h3>
                        <p>
                          {journeyOrder
                            ? `#${shortId(journeyOrder._id)} · ${journeyOrder.items[0]?.name}`
                            : 'No orders to show yet'}
                        </p>
                      </div>

                      <span className="live-indicator">
                        <i /> Recorded
                      </span>
                    </div>

                    {journeyOrder ? (
                      <div className="timeline">
                        {journeyOrder.trackingHistory.map((event, index, all) => (
                          <TimelineItem
                            key={`${event.status}-${index}`}
                            title={event.message}
                            time={fmtDateTime(event.timestamp)}
                            done={index < all.length - 1 || event.status === 'Delivered'}
                            current={
                              index === all.length - 1 &&
                              event.status !== 'Delivered' &&
                              event.status !== 'Cancelled'
                            }
                          />
                        ))}

                        {journeyOrder.orderStatus !== 'Delivered' &&
                          journeyOrder.estimatedDelivery?.to && (
                            <TimelineItem
                              title="Delivery (estimate only)"
                              time={`${fmtDate(journeyOrder.estimatedDelivery.from)} – ${fmtDate(journeyOrder.estimatedDelivery.to)}`}
                            />
                          )}
                      </div>
                    ) : (
                      <p className="tc-muted">
                        Your order history will appear here once you place an order.
                      </p>
                    )}

                    <button
                      className="panel-footer-link"
                      onClick={() => setActive('My orders')}
                    >
                      See full tracking details <ArrowRight size={15} />
                    </button>
                  </div>

                  <div className="support-callout">
                    <div className="support-bubble">
                      <Headphones size={19} />
                    </div>

                    <div className="support-copy">
                      <strong>Need a hand?</strong>
                      <p>Every question deserves a clear answer.</p>

                      <button onClick={() => setActive('Help & support')}>
                        Visit support centre <ArrowRight size={14} />
                      </button>
                    </div>

                    <div className="callout-arrow">
                      <ArrowDownRight size={19} />
                    </div>
                  </div>
                </div>
              </section>
            </>
          )}

          <footer className="footer">
            <span>© 2026 TrustCart</span>
            <span>
              <ShieldCheck size={13} /> Your shopping, made clearer.
            </span>
            <span className="demo-note">
              Portfolio demo · Simulated payments
            </span>
          </footer>
        </div>
      </main>
    </div>
  )
}

function StatCard({
  icon,
  label,
  value,
  detail,
  tone,
}: {
  icon: ReactNode
  label: string
  value: string
  detail: string
  tone: string
}) {
  return (
    <div className="stat-card">
      <div className={`stat-icon ${tone}`}>{icon}</div>
      <div className="stat-info">
        <span>{label}</span>
        <strong>{value}</strong>
        <small>{detail}</small>
      </div>
    </div>
  )
}

function TimelineItem({
  title,
  time,
  done,
  current,
}: {
  title: string
  time: string
  done?: boolean
  current?: boolean
}) {
  return (
    <div
      className={`timeline-item ${done ? 'done' : ''} ${
        current ? 'current' : ''
      }`}
    >
      <div className="timeline-marker">
        {done ? (
          <Check size={12} />
        ) : current ? (
          <Truck size={13} />
        ) : null}
      </div>

      <div className="timeline-copy">
        <strong>{title}</strong>
        <span>{time}</span>
      </div>
    </div>
  )
}

function sectionSubtitle(active: Tab) {
  const subtitles: Record<Tab, string> = {
    Overview: 'Here’s what’s happening with your orders today.',
    'Shopping Cart': 'Review items, quantities and your subtotal.',
    'My orders': 'Every order, with status updates you can understand.',
    'Returns & refunds':
      'Know what stage your request is in and what happens next.',
    'Help & support':
      'Your questions, replies and resolutions in one place.',
    Admin: 'Manage orders, refunds, support tickets and products.',
  }

  return subtitles[active]
}

export default App
