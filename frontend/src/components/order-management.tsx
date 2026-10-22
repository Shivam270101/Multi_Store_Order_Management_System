"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Image from "next/image";
import { io, type Socket } from "socket.io-client";

const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:5000";
const statuses = ["PLACED", "PREPARING", "COMPLETED"] as const;

type OrderStatus = (typeof statuses)[number];
type ItemDraft = {
  item_id: string;
  qty: string;
  fallbackName?: string;
  fallbackPrice?: number;
};
type OrderItem = { item_id: string; qty: number; unit_price: number };
type Dish = { item_id: string; name: string; category: string; price: number };
type Order = {
  id: number;
  store_id: string;
  items: OrderItem[];
  total_amount: number;
  status: OrderStatus;
  created_at: string;
};
type OrderPagination = { page: number; limit: number; total: number; pages: number };
type Analytics = {
  ordersPerDay: Array<{ order_day: string; order_count: number }>;
  revenuePerStore: Array<{ store_id: string; total_revenue: number; order_count: number }>;
  topItems: Array<{ item_id: string; units_sold: number }>;
};

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const response = await fetch(`${apiUrl}${path}`, {
    ...options,
    headers: { "Content-Type": "application/json", ...options?.headers },
  });
  if (!response.ok) {
    const body = (await response.json().catch(() => ({}))) as { error?: string };
    throw new Error(body.error ?? `Request failed (${response.status})`);
  }
  return response.json() as Promise<T>;
}

const money = new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: "INR",
  maximumFractionDigits: 2,
});

function normalizeDishId(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]/g, "");
}

function findDish(dishes: Dish[], itemId: string) {
  const normalizedId = normalizeDishId(itemId);
  return dishes.find((dish) => dish.item_id === itemId)
    ?? dishes.find((dish) =>
      normalizeDishId(dish.item_id) === normalizedId
      || normalizeDishId(dish.name) === normalizedId,
    );
}

function displayDishName(value: string) {
  return value.replace(/[-_]+/g, " ").replace(/\b\w/g, (character) => character.toUpperCase());
}

const number = new Intl.NumberFormat("en-IN");

export type OrderManagementView = "create" | "orders" | "status" | "dashboard";

export default function OrderManagement({
  view,
}: {
  view: OrderManagementView;
}) {
  const [storeId, setStoreId] = useState("store-1");
  const [statusFilter, setStatusFilter] = useState("");
  const [orders, setOrders] = useState<Order[]>([]);
  const [dishes, setDishes] = useState<Dish[]>([]);
  const [pagination, setPagination] = useState<OrderPagination>({
    page: 1,
    limit: 10,
    total: 0,
    pages: 0,
  });
  const [editingOrderId, setEditingOrderId] = useState<number | null>(null);
  const [editingStoreId, setEditingStoreId] = useState("");
  const [analytics, setAnalytics] = useState<Analytics>({
    ordersPerDay: [],
    revenuePerStore: [],
    topItems: [],
  });
  const [items, setItems] = useState<ItemDraft[]>([
    { item_id: "", qty: "1" },
  ]);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const socketRef = useRef<Socket | null>(null);
  const ordersRequestIdRef = useRef(0);
  const storeIdRef = useRef(storeId.trim());
  const subscribedStoreRef = useRef(storeId.trim());
  storeIdRef.current = storeId.trim();

  const refreshOrders = useCallback(async () => {
    const storeFilter = storeId.trim()
      ? `&store_id=${encodeURIComponent(storeId.trim())}`
      : "";
    const orderStatusFilter =
      (view === "orders" || view === "status") && statusFilter
        ? `&status=${encodeURIComponent(statusFilter)}`
        : "";
    const requestId = ++ordersRequestIdRef.current;
    const result = await request<{ data: Order[]; pagination: OrderPagination }>(
      `/orders?page=${pagination.page}&limit=${pagination.limit}${storeFilter}${orderStatusFilter}`,
    );
    if (requestId !== ordersRequestIdRef.current) {
      return;
    }
    setOrders(result.data);
    setPagination(result.pagination);
  }, [pagination.limit, pagination.page, statusFilter, storeId, view]);

  const refreshDishes = useCallback(async () => {
    setDishes(await request<Dish[]>("/dishes"));
  }, []);

  const refreshAnalytics = useCallback(async () => {
    const [ordersPerDay, revenuePerStore, topItems] = await Promise.all([
      request<Analytics["ordersPerDay"]>("/analytics/orders-per-day?days=30"),
      request<Analytics["revenuePerStore"]>("/analytics/revenue-per-store"),
      request<Analytics["topItems"]>("/analytics/top-items"),
    ]);
    setAnalytics({ ordersPerDay, revenuePerStore, topItems });
  }, []);
  const refreshOrdersRef = useRef(refreshOrders);
  const refreshAnalyticsRef = useRef(refreshAnalytics);
  refreshOrdersRef.current = refreshOrders;
  refreshAnalyticsRef.current = refreshAnalytics;

  const refreshDashboard = useCallback(async () => {
    setLoading(true);
    try {
      await Promise.all([
        refreshOrders(),
        refreshAnalytics(),
        refreshDishes(),
      ]);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not load dashboard");
    } finally {
      setLoading(false);
    }
  }, [refreshAnalytics, refreshDishes, refreshOrders]);

  useEffect(() => {
    setPagination((current) => ({ ...current, page: 1 }));
    setEditingOrderId(null);
    setEditingStoreId("");
    setItems([{ item_id: "", qty: "1" }]);
    setMessage("");
  }, [storeId]);

  useEffect(() => {
    void refreshDashboard();
  }, [refreshDashboard]);

  useEffect(() => {
    const socket: Socket = io(apiUrl, {
      reconnection: true,
      reconnectionAttempts: Infinity,
      reconnectionDelay: 1_000,
      reconnectionDelayMax: 10_000,
    });
    socketRef.current = socket;
    let refreshTimer: ReturnType<typeof setTimeout> | undefined;

    const scheduleRefresh = () => {
      if (refreshTimer) {
        clearTimeout(refreshTimer);
      }
      refreshTimer = setTimeout(() => {
        refreshTimer = undefined;
        void Promise.all([
          refreshOrdersRef.current(),
          refreshAnalyticsRef.current(),
        ]).catch((error: unknown) => {
          setMessage(error instanceof Error ? error.message : "Could not refresh live data");
        });
      }, 100);
    };
    const handleConnect = () => {
      socket.emit("stores:subscribe", storeIdRef.current || null);
      if (!socket.recovered) {
        scheduleRefresh();
      }
    };
    const isSelectedStore = (eventStoreId: string) =>
      !storeIdRef.current || eventStoreId === storeIdRef.current;
    const handleOrderCreated = (order: Order) => {
      if (isSelectedStore(order.store_id)) {
        scheduleRefresh();
      }
    };
    const handleOrderUpdated = (order: Order) => {
      if (isSelectedStore(order.store_id)) {
        scheduleRefresh();
      }
    };
    const handleOrderDeleted = (order: { id: number; store_id: string }) => {
      if (isSelectedStore(order.store_id)) {
        scheduleRefresh();
      }
    };

    socket.on("connect", handleConnect);
    socket.on("order:created", handleOrderCreated);
    socket.on("order:updated", handleOrderUpdated);
    socket.on("order:deleted", handleOrderDeleted);
    return () => {
      if (refreshTimer) {
        clearTimeout(refreshTimer);
      }
      socket.off("connect", handleConnect);
      socket.off("order:created", handleOrderCreated);
      socket.off("order:updated", handleOrderUpdated);
      socket.off("order:deleted", handleOrderDeleted);
      socket.disconnect();
      socketRef.current = null;
    };
  }, []);

  useEffect(() => {
    const selectedStore = storeId.trim();
    if (subscribedStoreRef.current === selectedStore) {
      return;
    }
    subscribedStoreRef.current = selectedStore;
    if (socketRef.current?.connected) {
      socketRef.current.emit("stores:subscribe", selectedStore || null);
    }
  }, [storeId]);

  function updateItem(index: number, field: keyof ItemDraft, value: string) {
    setItems((current) =>
      current.map((item, itemIndex) =>
        itemIndex === index
          ? field === "item_id"
            ? { ...item, item_id: value, fallbackName: undefined, fallbackPrice: undefined }
            : { ...item, [field]: value }
          : item,
      ),
    );
  }

  function addDishToOrder(dish: Dish) {
    setItems((current) => {
      const existingIndex = current.findIndex((item) => item.item_id === dish.item_id);
      if (existingIndex < 0) {
        return [
          ...current.filter((item) => item.item_id !== ""),
          { item_id: dish.item_id, qty: "1" },
        ];
      }
      return current.map((item, index) =>
        index === existingIndex
          ? { ...item, qty: String(Number(item.qty) + 1) }
          : item,
      );
    });
  }

  function startEditing(order: Order) {
    setEditingOrderId(order.id);
    setItems(
      order.items.map((item) => ({
        item_id: findDish(dishes, item.item_id)?.item_id ?? item.item_id,
        qty: String(item.qty),
        fallbackName: displayDishName(item.item_id),
        fallbackPrice: Number(item.unit_price),
      })),
    );
    setEditingStoreId(order.store_id);
  }

  function cancelEditing() {
    setEditingOrderId(null);
    setEditingStoreId("");
    setItems([{ item_id: "", qty: "1" }]);
  }

  async function saveOrder(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setMessage("");
    try {
      const savedOrder = await request<Order>(
        editingOrderId === null ? "/orders" : `/orders/${editingOrderId}`,
        {
          method: editingOrderId === null ? "POST" : "PUT",
          body: JSON.stringify({
            store_id: editingOrderId === null ? storeId.trim() : editingStoreId,
            items: items.map((item) => ({
              item_id: item.item_id.trim(),
              qty: Number(item.qty),
            })),
          }),
        },
      );
      const wasEditing = editingOrderId !== null;
      if (wasEditing) {
        ordersRequestIdRef.current += 1;
        setOrders((current) =>
          current.map((order) => order.id === savedOrder.id ? savedOrder : order),
        );
      }
      setEditingOrderId(null);
      setEditingStoreId("");
      setItems([{ item_id: "", qty: "1" }]);
      setMessage(wasEditing ? "Order changes saved." : "Order placed successfully.");
      if (wasEditing) {
        await refreshAnalytics();
      } else {
        await refreshDashboard();
      }
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not create order");
    } finally {
      setBusy(false);
    }
  }

  async function archiveOrder(orderId: number) {
    if (!window.confirm(`Archive order #${orderId}? It will be removed from the active list but kept in analytics.`)) {
      return;
    }
    setBusy(true);
    setMessage("");
    try {
      await request<{ id: number; archived: boolean }>(`/orders/${orderId}`, {
        method: "DELETE",
      });
      setMessage(`Order #${orderId} archived.`);
      await refreshDashboard();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not archive order");
    } finally {
      setBusy(false);
    }
  }

  async function updateStatus(orderId: number, status: OrderStatus) {
    setBusy(true);
    setMessage("");
    try {
      await request<Order>(`/orders/${orderId}/status`, {
        method: "PATCH",
        body: JSON.stringify({ status }),
      });
      setMessage(`Order #${orderId} updated.`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not update order");
    } finally {
      setBusy(false);
    }
  }

  async function archiveOrders() {
    setBusy(true);
    setMessage("");
    try {
      const result = await request<{ archived_count: number }>("/archive-old-orders", {
        method: "POST",
      });
      setMessage(`${result.archived_count} old orders archived.`);
      await refreshDashboard();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not archive orders");
    } finally {
      setBusy(false);
    }
  }

  const revenue = storeId.trim()
    ? analytics.revenuePerStore.find((store) => store.store_id === storeId.trim())
    : analytics.revenuePerStore.reduce(
        (summary, store) => ({
          total_revenue: summary.total_revenue + Number(store.total_revenue),
          order_count: summary.order_count + Number(store.order_count),
        }),
        { total_revenue: 0, order_count: 0 },
      );
  const totalPages = Math.max(1, pagination.pages);
  const trend = Array.from({ length: 14 }, (_, index) => {
    const date = new Date();
    date.setUTCHours(0, 0, 0, 0);
    date.setUTCDate(date.getUTCDate() - (13 - index));
    const day = date.toISOString().slice(0, 10);
    return {
      day,
      count: Number(
        analytics.ordersPerDay.find((entry) => entry.order_day.slice(0, 10) === day)
          ?.order_count ?? 0,
      ),
    };
  });
  const trendTotal = trend.reduce((sum, day) => sum + day.count, 0);
  const peakDay = trend.reduce(
    (peak, day) => (day.count > peak.count ? day : peak),
    trend[0]!,
  );
  const chartMax = Math.max(1, ...trend.map((day) => day.count));
  const chartPoints = trend.map((day, index) => ({
    ...day,
    x: 42 + (index * 716) / (trend.length - 1),
    y: 164 - (day.count / chartMax) * 120,
  }));
  const chartLine = chartPoints.map((point) => `${point.x},${point.y}`).join(" ");
  const chartArea = `42,178 ${chartLine} 758,178`;
  const bestStore = analytics.revenuePerStore[0];
  const highestItemSales = Math.max(
    1,
    ...analytics.topItems.map((item) => Number(item.units_sold)),
  );
  const averageOrderValue =
    Number(revenue?.order_count ?? 0) > 0
      ? Number(revenue?.total_revenue ?? 0) / Number(revenue?.order_count)
      : 0;
  const draftTotal = items.reduce((total, item) => {
    const dishPrice = findDish(dishes, item.item_id)?.price ?? item.fallbackPrice ?? 0;
    return total + dishPrice * (Number(item.qty) || 0);
  }, 0);

  return (
    <main className={`shell page-view-${view}`}>
      <header className="topbar">
        <a className="brand" href="/create-order" aria-label="Storefront home">
          <Image
            src="/storefront-logo.svg"
            alt="Storefront"
            width={188}
            height={44}
            priority
          />
        </a>
        <nav className="main-nav" aria-label="Order management pages">
          <a className={view === "create" ? "active" : ""} href="/create-order">Create order</a>
          <a className={view === "orders" ? "active" : ""} href="/orders">Orders list</a>
          <a className={view === "status" ? "active" : ""} href="/update-status">Update status</a>
          <a className={view === "dashboard" ? "active" : ""} href="/dashboard">Dashboard</a>
        </nav>
        <div className="connection"><span className="live-dot" /> Live updates enabled</div>
      </header>

      <section className="intro">
        <div>
          <p className="eyebrow">ORDER MANAGEMENT / PAGE {view === "create" ? "1" : view === "orders" ? "2" : view === "status" ? "3" : "OVERVIEW"}</p>
          <h1>{view === "create" ? "Create an order" : view === "orders" ? "Orders list" : view === "status" ? "Update order status" : "Good service starts with a great order."}</h1>
          <p className="subtitle">{view === "create" ? "Choose a store and add dishes to place a new order." : view === "orders" ? "Filter orders by store and review the live order queue." : view === "status" ? "Find an order and change its current status." : "Manage store orders, track performance, and keep every location moving."}</p>
        </div>
        {view !== "dashboard" && (
        <div className="store-controls">
          <label className="store-picker">
            <span>{storeId ? "ACTIVE STORE" : "ORDER SCOPE"}</span>
            <input value={storeId} placeholder="All stores" onChange={(event) => setStoreId(event.target.value)} aria-label="Active store ID" />
          </label>
          <div className="store-tabs" aria-label="Demo stores">
            <button
              className={storeId === "" ? "store-tab active" : "store-tab"}
              onClick={() => setStoreId("")}
              type="button"
            >
              All stores
            </button>
            {["store-1", "store-2", "store-3"].map((store) => (
              <button
                className={storeId === store ? "store-tab active" : "store-tab"}
                key={store}
                onClick={() => setStoreId(store)}
                type="button"
              >
                {store.replace("-", " ")}
              </button>
            ))}
          </div>
          <span className="store-hint">Orders below are filtered to the active store.</span>
        </div>
        )}
      </section>

      {message && <div className="notice" role="status">{message}</div>}

      {view === "dashboard" && <section className="metric-grid" aria-label="Store summary">
        <article className="metric-card">
          <span className="metric-icon icon-orders">↗</span>
          <p>{storeId ? "Orders in store" : "Orders across stores"}</p>
          <strong>{pagination.total}</strong>
          <small>{storeId ? `Orders for ${storeId}` : "Across all stores"}</small>
        </article>
        <article className="metric-card">
          <span className="metric-icon icon-revenue">₹</span>
          <p>{storeId ? "Store revenue" : "Revenue across stores"}</p>
          <strong>{money.format(Number(revenue?.total_revenue ?? 0))}</strong>
          <small>{revenue?.order_count ?? 0} orders including archive</small>
        </article>
        <article className="metric-card metric-dark">
          <span className="metric-icon icon-live">●</span>
          <p>Order pulse</p>
          <strong>{analytics.ordersPerDay.reduce((sum, day) => sum + Number(day.order_count), 0)}</strong>
          <small>Orders across all stores · last 30 days</small>
        </article>
      </section>}

      <div className="content-grid">
        {view === "create" && (
          <section className="panel menu-panel">
            <div className="section-heading">
              <div><p className="eyebrow">AVAILABLE MENU</p><h2>Dishes &amp; prices</h2></div>
              <span className="step-label">{dishes.length} ITEMS</span>
            </div>
            {dishes.length > 0 ? (
              <div className="dish-catalog">
                {dishes.map((dish) => (
                  <article className="dish-card" key={dish.item_id}>
                    <div className="dish-details">
                      <span>{dish.category}</span>
                      <strong>{dish.name}</strong>
                    </div>
                    <strong className="dish-price">{money.format(Number(dish.price))}</strong>
                    <button
                      className="dish-add-button"
                      type="button"
                      onClick={() => addDishToOrder(dish)}
                      disabled={busy}
                      aria-label={`Add ${dish.name} for ${money.format(Number(dish.price))}`}
                    >
                      Add
                    </button>
                  </article>
                ))}
              </div>
            ) : (
              <div className="empty-state">{loading ? "Loading dishes…" : "No available dishes found."}</div>
            )}
          </section>
        )}
        {(view === "create" || view === "dashboard") && (
        <section className="panel create-panel">
          <div className="section-heading">
            <div><p className="eyebrow">NEW ORDER</p><h2>{editingOrderId === null ? "Your order" : `Edit order #${editingOrderId}`}</h2></div>
            <span className="step-label">01 / 02</span>
          </div>
          <form onSubmit={saveOrder}>
            <div className="field-label"><span>ITEMS</span><span>PRICE · QTY</span></div>
            <div className="item-list">
              {items.map((item, index) => (
                <div className="item-row" key={index}>
                  <select
                    value={item.item_id}
                    onChange={(event) => updateItem(index, "item_id", event.target.value)}
                    aria-label={`Item ${index + 1} ID`}
                    required
                  >
                    <option value="">Choose a dish</option>
                    {item.item_id && !findDish(dishes, item.item_id) && (
                      <option value={item.item_id}>
                        {item.fallbackName ?? displayDishName(item.item_id)} · {money.format(item.fallbackPrice ?? 0)}
                      </option>
                    )}
                    {dishes.map((dish) => (
                      <option key={dish.item_id} value={dish.item_id}>
                        {dish.name} · {money.format(dish.price)}
                      </option>
                    ))}
                  </select>
                  <input
                    type="number"
                    min="1"
                    step="1"
                    value={item.qty}
                    onChange={(event) => updateItem(index, "qty", event.target.value)}
                    aria-label={`Item ${index + 1} quantity`}
                    required
                  />
                  <button className="remove-item" type="button" onClick={() => setItems((current) => current.filter((_, itemIndex) => itemIndex !== index))} disabled={items.length === 1} aria-label="Remove item">×</button>
                </div>
              ))}
            </div>
            <button className="text-button" type="button" onClick={() => setItems((current) => [...current, { item_id: "", qty: "1" }])}>+ Add another dish</button>
            <div className="form-footer">
              <span>Estimated total<br /><strong>{money.format(draftTotal)}</strong></span>
              <div className="form-actions">
                {editingOrderId !== null && <button className="secondary-button" type="button" onClick={cancelEditing}>Cancel</button>}
                <button className="primary-button" type="submit" disabled={busy || (editingOrderId === null && !storeId.trim()) || dishes.length === 0}>{busy ? "Working..." : editingOrderId === null ? "Place order" : "Save changes"} <span>↗</span></button>
              </div>
            </div>
          </form>
        </section>
        )}

        {(view === "orders" || view === "status" || view === "dashboard") && <section className="panel orders-panel">
          <div className="section-heading">
            <div><p className="eyebrow">{view === "status" ? "ORDER STATUS" : "LIVE QUEUE"} · {storeId || "ALL STORES"}</p><h2>{view === "status" ? "Select a status to update" : "Recent orders"}</h2></div>
            <div className="orders-heading-actions">
              {view === "dashboard" && (
                <label className="dashboard-store-filter">
                  <span>STORE</span>
                  <select
                    aria-label="Filter dashboard orders by store"
                    value={storeId}
                    onChange={(event) => setStoreId(event.target.value)}
                  >
                    <option value="">All stores</option>
                    {["store-1", "store-2", "store-3"].map((store) => (
                      <option key={store} value={store}>
                        {store.replace("-", " ")}
                      </option>
                    ))}
                  </select>
                </label>
              )}
              {(view === "orders" || view === "status") && (
                <label className="dashboard-store-filter">
                  <span>STATUS</span>
                  <select
                    aria-label={`Filter ${view === "orders" ? "orders" : "status page"} by order status`}
                    value={statusFilter}
                    onChange={(event) => {
                      setStatusFilter(event.target.value);
                      setPagination((current) => ({ ...current, page: 1 }));
                    }}
                  >
                    <option value="">All statuses</option>
                    {statuses.map((status) => (
                      <option key={status} value={status}>{status}</option>
                    ))}
                  </select>
                </label>
              )}
              <button className="refresh-button" onClick={() => void refreshDashboard()} disabled={loading} aria-label="Refresh dashboard">↻</button>
            </div>
          </div>
          {loading ? <div className="empty-state">Loading orders…</div> : orders.length === 0 ? (
            <div className="empty-state">No orders for this store yet. Your next order will show up here.</div>
          ) : (
            <div className="order-list">
              {orders.map((order) => (
                <article className="order-row" key={order.id}>
                  <div className="order-main">
                    <div className="order-title"><strong>Order #{order.id}</strong><span>{order.store_id} · {new Date(order.created_at).toLocaleString()}</span></div>
                    <p>{order.items.map((item) => `${item.qty} × ${findDish(dishes, item.item_id)?.name ?? displayDishName(item.item_id)}`).join(" · ")}</p>
                  </div>
                  <div className="order-side">
                    <strong>{money.format(Number(order.total_amount))}</strong>
                    {view === "status" ? (
                      <select aria-label={`Update status for order ${order.id}`} value={order.status} disabled={busy} onChange={(event) => void updateStatus(order.id, event.target.value as OrderStatus)}>
                        {statuses.map((status) => <option key={status} value={status}>{status}</option>)}
                      </select>
                    ) : <span className="order-status">{order.status}</span>}
                    {(view === "orders" || view === "dashboard") && <div className="order-actions">
                      {view === "dashboard" && <button type="button" onClick={() => startEditing(order)} disabled={busy}>Edit</button>}
                      <button type="button" onClick={() => void archiveOrder(order.id)} disabled={busy}>Archive</button>
                    </div>}
                  </div>
                </article>
              ))}
            </div>
          )}
          {pagination.total > 0 && (
            <div className="pagination">
              <span>Showing {(pagination.page - 1) * pagination.limit + 1}–{Math.min(pagination.page * pagination.limit, pagination.total)} of {pagination.total}</span>
              <div className="pagination-controls">
                <button
                  type="button"
                  onClick={() => setPagination((current) => ({ ...current, page: Math.max(1, current.page - 1) }))}
                  disabled={loading || pagination.page <= 1}
                >
                  Previous
                </button>
                <strong>Page {pagination.page} of {totalPages}</strong>
                <button
                  type="button"
                  onClick={() => setPagination((current) => ({ ...current, page: Math.min(totalPages, current.page + 1) }))}
                  disabled={loading || pagination.page >= totalPages}
                >
                  Next
                </button>
              </div>
            </div>
          )}
        </section>}
      </div>

      {view === "dashboard" && <section className="panel analytics-panel">
        <div className="analytics-heading">
          <div><p className="eyebrow">PERFORMANCE / INSIGHTS</p><h2>Analytics at a glance</h2><p className="analytics-subtitle">A clearer view of demand, menu performance and store revenue.</p></div>
          <button className="secondary-button" onClick={() => void archiveOrders()} disabled={busy}>Archive orders older than 30 days</button>
        </div>
        <div className="insight-grid">
          <article className="insight-card">
            <span className="insight-icon">₹</span>
            <span className="insight-label">AVERAGE ORDER VALUE</span>
            <strong>{money.format(averageOrderValue)}</strong>
            <small>{storeId ? `For ${storeId}, including archived orders` : "Across all stores, including archive"}</small>
          </article>
          <article className="insight-card">
            <span className="insight-icon insight-icon-green">↗</span>
            <span className="insight-label">BUSIEST DAY · 14 DAYS</span>
            <strong>{number.format(peakDay.count)} orders</strong>
            <small>{peakDay.count ? new Date(`${peakDay.day}T00:00:00Z`).toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric", timeZone: "UTC" }) : "No orders in this period"}</small>
          </article>
          <article className="insight-card">
            <span className="insight-icon insight-icon-gold">✳</span>
            <span className="insight-label">TOP REVENUE STORE</span>
            <strong>{bestStore?.store_id ?? "—"}</strong>
            <small>{bestStore ? `${money.format(Number(bestStore.total_revenue))} total revenue` : "Revenue appears as orders arrive"}</small>
          </article>
        </div>
        <div className="analytics-grid">
          <section className="analytics-card demand-card">
            <div className="analytics-card-heading">
              <div><p className="eyebrow">ORDER VOLUME</p><h3>Demand trend</h3></div>
              <span className="chart-period">LAST 14 DAYS</span>
            </div>
            <div className="chart-summary">
              <strong>{number.format(trendTotal)}</strong>
              <span>orders across all stores</span>
              <span className="chart-peak">{number.format(peakDay.count)} peak</span>
            </div>
            <div className="trend-chart">
              <svg viewBox="0 0 800 205" role="img" aria-label={`Orders per day for the last 14 days, ${trendTotal} total`}>
                <defs>
                  <linearGradient id="demand-fill" x1="0" x2="0" y1="0" y2="1">
                    <stop offset="0%" stopColor="#92bd68" stopOpacity=".27" />
                    <stop offset="100%" stopColor="#92bd68" stopOpacity=".015" />
                  </linearGradient>
                </defs>
                {[44, 84, 124, 164].map((y) => <line className="chart-gridline" key={y} x1="42" x2="758" y1={y} y2={y} />)}
                <polygon points={chartArea} fill="url(#demand-fill)" />
                <polyline points={chartLine} className="chart-line" />
                {chartPoints.map((point) => (
                  <circle className="chart-point" key={point.day} cx={point.x} cy={point.y} r={point.count === peakDay.count && point.count > 0 ? 4.5 : 3} />
                ))}
                {[0, 6, 13].map((index) => (
                  <text className="chart-date" key={index} x={chartPoints[index]!.x} y="198" textAnchor={index === 0 ? "start" : index === 13 ? "end" : "middle"}>
                    {new Date(`${chartPoints[index]!.day}T00:00:00Z`).toLocaleDateString(undefined, { month: "short", day: "numeric", timeZone: "UTC" })}
                  </text>
                ))}
              </svg>
            </div>
            <p className="chart-note">Daily order counts from active and archived orders.</p>
          </section>

          <section className="analytics-card ranking-card">
            <div className="analytics-card-heading">
              <div><p className="eyebrow">MENU PERFORMANCE</p><h3>Top selling dishes</h3></div>
              <span className="chart-period">TOP 5</span>
            </div>
            {analytics.topItems.length ? (
              <div className="performance-list">
                {analytics.topItems.map((item, index) => {
                  const sales = Number(item.units_sold);
                  return (
                    <div className="performance-item" key={item.item_id}>
                      <div className="performance-label">
                        <span className="rank-number">0{index + 1}</span>
                        <strong>{dishes.find((dish) => dish.item_id === item.item_id)?.name ?? item.item_id}</strong>
                        <span>{number.format(sales)}</span>
                      </div>
                      <div className="performance-track"><span style={{ width: `${(sales / highestItemSales) * 100}%` }} /></div>
                    </div>
                  );
                })}
              </div>
            ) : <p className="muted">No sales data yet.</p>}
            <p className="chart-note">Units sold across active and archived orders.</p>
          </section>

          <section className="analytics-card store-performance-card">
            <div className="analytics-card-heading">
              <div><p className="eyebrow">LOCATION COMPARISON</p><h3>Revenue by store</h3></div>
              <span className="chart-period">ALL STORES</span>
            </div>
            {analytics.revenuePerStore.length ? (
              <div className="store-performance-list">
                {analytics.revenuePerStore.slice(0, 5).map((store, index) => {
                  const revenueMax = Math.max(...analytics.revenuePerStore.map((entry) => Number(entry.total_revenue)), 1);
                  return (
                    <div className="store-performance-row" key={store.store_id}>
                      <span className="store-rank">0{index + 1}</span>
                      <div className="store-performance-main">
                        <div><strong>{store.store_id}</strong><span>{number.format(Number(store.order_count))} orders</span></div>
                        <div className="performance-track"><span className="store-bar" style={{ width: `${(Number(store.total_revenue) / revenueMax) * 100}%` }} /></div>
                      </div>
                      <strong className="store-revenue">{money.format(Number(store.total_revenue))}</strong>
                    </div>
                  );
                })}
              </div>
            ) : <p className="muted">No store revenue data yet.</p>}
            <p className="chart-note">Revenue includes active and archived orders.</p>
          </section>
        </div>
      </section>}
      <footer>Built for thoughtful, efficient store operations <span>✳</span></footer>
    </main>
  );
}
