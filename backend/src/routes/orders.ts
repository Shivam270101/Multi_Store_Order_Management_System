import { Router } from "express";
import type { PoolConnection, RowDataPacket } from "mysql2/promise";
import { z } from "zod";

import { pool } from "../config/db";
import {
  emitOrderCreated,
  emitOrderDeleted,
  emitOrderUpdated,
} from "../config/socket";
import { orderStatuses, type Order, type OrderItem } from "../domain/order";
import { validateBody } from "../middleware/validate";

const router = Router();
const createOrderSchema = z.object({
  store_id: z.string().trim().min(1).max(100),
  items: z
    .array(
      z.object({
        item_id: z.string().trim().min(1).max(100),
        qty: z.number().int().positive().max(100_000),
      }),
    )
    .min(1)
    .max(500),
});
const statusSchema = z.object({ status: z.enum(orderStatuses) });
const replaceOrderSchema = createOrderSchema;

async function getPricedItems(
  connection: PoolConnection,
  requestedItems: Array<{ item_id: string; qty: number }>,
  fallbackPrices: Map<string, number> = new Map(),
): Promise<OrderItem[] | null> {
  const placeholders = requestedItems.map(() => "?").join(", ");
  const [rows] = await connection.query<
    Array<RowDataPacket & { item_id: string; price: number }>
  >(
    `SELECT item_id, price FROM dishes
     WHERE available = TRUE AND item_id IN (${placeholders})`,
    requestedItems.map((item) => item.item_id),
  );
  const prices = new Map(rows.map((row) => [row.item_id, Number(row.price)]));
  const pricedItems: OrderItem[] = [];
  for (const item of requestedItems) {
    const unit_price = prices.get(item.item_id) ?? fallbackPrices.get(item.item_id);
    if (unit_price === undefined) {
      return null;
    }
    pricedItems.push({ ...item, unit_price });
  }
  return pricedItems;
}

router.post("/", validateBody(createOrderSchema), async (request, response, next) => {
  const { store_id, items: requestedItems } = request.body as z.infer<typeof createOrderSchema>;
  const connection = await pool.getConnection();

  try {
    await connection.beginTransaction();
    const items = await getPricedItems(connection, requestedItems);
    if (!items) {
      await connection.rollback();
      response.status(400).json({ error: "One or more dishes are unavailable" });
      return;
    }
    const total_amount = Number(
      items.reduce((sum, item) => sum + item.qty * item.unit_price, 0).toFixed(2),
    );
    const [orderResult] = await connection.execute(
      "INSERT INTO orders (store_id, total_amount, status) VALUES (?, ?, 'PLACED')",
      [store_id, total_amount],
    );
    const orderId = (orderResult as { insertId: number }).insertId;
    for (const item of items) {
      await connection.execute(
        "INSERT INTO order_items (order_id, item_id, qty, unit_price) VALUES (?, ?, ?, ?)",
        [orderId, item.item_id, item.qty, item.unit_price],
      );
    }
    await connection.commit();

    const order: Order = {
      id: orderId,
      store_id,
      items,
      total_amount,
      status: "PLACED",
      created_at: new Date().toISOString(),
    };
    emitOrderCreated(order);
    response.status(201).json(order);
  } catch (error) {
    await connection.rollback();
    next(error);
  } finally {
    connection.release();
  }
});

router.get("/", async (request, response, next) => {
  const storeId = request.query.store_id?.toString().trim();
  const status = request.query.status?.toString().trim();
  const page = Number(request.query.page ?? 1);
  const limit = Number(request.query.limit ?? 20);
  const validStatus =
    status === undefined || orderStatuses.some((orderStatus) => orderStatus === status);
  if (
    !Number.isSafeInteger(page) ||
    page < 1 ||
    !Number.isSafeInteger(limit) ||
    limit < 1 ||
    limit > 100 ||
    (request.query.store_id !== undefined && !storeId) ||
    (request.query.status !== undefined && !validStatus)
  ) {
    response.status(400).json({ error: "Invalid store_id, status, page, or limit" });
    return;
  }

  try {
    const conditions: string[] = [];
    const parameters: Array<string | number> = [];
    if (storeId) {
      conditions.push("store_id = ?");
      parameters.push(storeId);
    }
    if (status) {
      conditions.push("status = ?");
      parameters.push(status);
    }
    const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";
    const [countRows] = await pool.query<Array<RowDataPacket & { total: number }>>(
      `SELECT COUNT(*) AS total FROM orders ${where}`,
      parameters,
    );
    const total = Number(countRows[0]?.total ?? 0);
    const [orderRows] = await pool.query(
      `SELECT id, store_id, total_amount, status, created_at
       FROM orders ${where}
       ORDER BY created_at DESC, id DESC LIMIT ? OFFSET ?`,
      [...parameters, limit, (page - 1) * limit],
    );
    const orders = orderRows as Array<Omit<Order, "items">>;
    const ids = orders.map((order) => order.id);
    let itemRows: Array<OrderItem & { order_id: number }> = [];
    if (ids.length) {
      const placeholders = ids.map(() => "?").join(", ");
      const [rows] = await pool.query(
        `SELECT order_id, item_id, qty, unit_price FROM order_items
         WHERE order_id IN (${placeholders}) ORDER BY id`,
        ids,
      );
      itemRows = rows as typeof itemRows;
    }
    const itemsByOrder = new Map<number, OrderItem[]>();
    for (const item of itemRows) {
      const list = itemsByOrder.get(item.order_id) ?? [];
      list.push({ item_id: item.item_id, qty: item.qty, unit_price: item.unit_price });
      itemsByOrder.set(item.order_id, list);
    }
    response.json({
      data: orders.map((order) => ({
        ...order,
        total_amount: Number(order.total_amount),
        created_at: new Date(order.created_at).toISOString(),
        items: itemsByOrder.get(order.id) ?? [],
      })),
      pagination: { page, limit, total, pages: Math.ceil(total / limit) },
    });
  } catch (error) {
    next(error);
  }
});

router.put(
  "/:id",
  validateBody(replaceOrderSchema),
  async (request, response, next) => {
    const id = Number(request.params.id);
    if (!Number.isSafeInteger(id) || id < 1) {
      response.status(400).json({ error: "Invalid order id" });
      return;
    }
    const { store_id, items: requestedItems } = request.body as z.infer<typeof replaceOrderSchema>;
    const connection = await pool.getConnection();

    try {
      await connection.beginTransaction();
      const [existingRows] = await connection.execute(
        "SELECT store_id FROM orders WHERE id = ? FOR UPDATE",
        [id],
      );
      const existing = (existingRows as Array<{ store_id: string }>)[0];
      if (!existing) {
        await connection.rollback();
        response.status(404).json({ error: "Order not found" });
        return;
      }

      const [existingItemRows] = await connection.execute(
        "SELECT item_id, unit_price FROM order_items WHERE order_id = ?",
        [id],
      );
      const fallbackPrices = new Map(
        (existingItemRows as Array<{ item_id: string; unit_price: number }>).map((item) => [
          item.item_id,
          Number(item.unit_price),
        ]),
      );
      const items = await getPricedItems(connection, requestedItems, fallbackPrices);
      if (!items) {
        await connection.rollback();
        response.status(400).json({ error: "One or more dishes are unavailable" });
        return;
      }
      const total_amount = Number(
        items.reduce((sum, item) => sum + item.qty * item.unit_price, 0).toFixed(2),
      );
      await connection.execute(
        "UPDATE orders SET store_id = ?, total_amount = ? WHERE id = ?",
        [store_id, total_amount, id],
      );
      await connection.execute("DELETE FROM order_items WHERE order_id = ?", [id]);
      for (const item of items) {
        await connection.execute(
          "INSERT INTO order_items (order_id, item_id, qty, unit_price) VALUES (?, ?, ?, ?)",
          [id, item.item_id, item.qty, item.unit_price],
        );
      }
      await connection.commit();

      const [orderRows] = await pool.execute(
        "SELECT status, created_at FROM orders WHERE id = ?",
        [id],
      );
      const updated = (orderRows as Array<{ status: Order["status"]; created_at: Date }>)[0];
      if (!updated) {
        response.status(404).json({ error: "Order not found" });
        return;
      }
      const order: Order = {
        id,
        store_id,
        items,
        total_amount,
        status: updated.status,
        created_at: new Date(updated.created_at).toISOString(),
      };
      if (existing.store_id !== store_id) {
        emitOrderDeleted({ id, store_id: existing.store_id });
      }
      emitOrderUpdated(order);
      response.json(order);
    } catch (error) {
      await connection.rollback();
      next(error);
    } finally {
      connection.release();
    }
  },
);

router.delete("/:id", async (request, response, next) => {
  const id = Number(request.params.id);
  if (!Number.isSafeInteger(id) || id < 1) {
    response.status(400).json({ error: "Invalid order id" });
    return;
  }

  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const [rows] = await connection.execute(
      "SELECT store_id FROM orders WHERE id = ? FOR UPDATE",
      [id],
    );
    const order = (rows as Array<{ store_id: string }>)[0];
    if (!order) {
      await connection.rollback();
      response.status(404).json({ error: "Order not found" });
      return;
    }

    await connection.execute(
      `INSERT INTO orders_archive (id, store_id, total_amount, status, created_at)
       SELECT id, store_id, total_amount, status, created_at FROM orders WHERE id = ?`,
      [id],
    );
    await connection.execute(
      `INSERT INTO order_items_archive (order_id, item_id, qty, unit_price)
       SELECT order_id, item_id, qty, unit_price FROM order_items WHERE order_id = ?`,
      [id],
    );
    await connection.execute("DELETE FROM orders WHERE id = ?", [id]);
    await connection.commit();

    emitOrderDeleted({ id, store_id: order.store_id });
    response.status(200).json({ id, archived: true });
  } catch (error) {
    await connection.rollback();
    next(error);
  } finally {
    connection.release();
  }
});

router.patch(
  "/:id/status",
  validateBody(statusSchema),
  async (request, response, next) => {
    const id = Number(request.params.id);
    if (!Number.isSafeInteger(id) || id < 1) {
      response.status(400).json({ error: "Invalid order id" });
      return;
    }
    const { status } = request.body as z.infer<typeof statusSchema>;

    try {
      await pool.execute(
        "UPDATE orders SET status = ? WHERE id = ?",
        [status, id],
      );
      const [rows] = await pool.execute(
        `SELECT o.id, o.store_id, o.total_amount, o.status, o.created_at,
                i.item_id, i.qty, i.unit_price
         FROM orders o LEFT JOIN order_items i ON i.order_id = o.id
         WHERE o.id = ? ORDER BY i.id`,
        [id],
      );
      const orderRows = rows as Array<{
        id: number;
        store_id: string;
        total_amount: number;
        status: Order["status"];
        created_at: Date;
        item_id: string | null;
        qty: number | null;
        unit_price: number | null;
      }>;
      const first = orderRows[0];
      if (!first) {
        response.status(404).json({ error: "Order not found" });
        return;
      }
      const order: Order = {
        id: first.id,
        store_id: first.store_id,
        total_amount: Number(first.total_amount),
        status: first.status,
        created_at: new Date(first.created_at).toISOString(),
        items: orderRows.flatMap((row) =>
          row.item_id === null || row.qty === null || row.unit_price === null
            ? []
            : [{ item_id: row.item_id, qty: row.qty, unit_price: Number(row.unit_price) }],
        ),
      };
      emitOrderUpdated(order);
      response.json(order);
    } catch (error) {
      next(error);
    }
  },
);

export { router as ordersRouter };
