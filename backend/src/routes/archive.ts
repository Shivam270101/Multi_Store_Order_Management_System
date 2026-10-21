import { Router } from "express";

import { pool } from "../config/db";

const router = Router();

router.post("/", async (_request, response, next) => {
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const [orders] = await connection.query(
      `SELECT id, store_id, total_amount, status, created_at
       FROM orders WHERE created_at < DATE_SUB(UTC_TIMESTAMP(), INTERVAL 30 DAY)
       FOR UPDATE`,
    );
    const oldOrders = orders as Array<{
      id: number;
      store_id: string;
      total_amount: number;
      status: string;
      created_at: Date;
    }>;
    if (oldOrders.length > 0) {
      const ids = oldOrders.map((order) => order.id);
      const placeholders = ids.map(() => "?").join(", ");
      await connection.query(
        `INSERT INTO orders_archive (id, store_id, total_amount, status, created_at)
         SELECT id, store_id, total_amount, status, created_at FROM orders
         WHERE id IN (${placeholders})`,
        ids,
      );
      await connection.query(
        `INSERT INTO order_items_archive (order_id, item_id, qty, unit_price)
         SELECT order_id, item_id, qty, unit_price FROM order_items
         WHERE order_id IN (${placeholders})`,
        ids,
      );
      await connection.query(`DELETE FROM orders WHERE id IN (${placeholders})`, ids);
    }
    await connection.commit();
    response.json({ archived_count: oldOrders.length });
  } catch (error) {
    await connection.rollback();
    next(error);
  } finally {
    connection.release();
  }
});

export { router as archiveRouter };
