import { Router } from "express";

import { pool } from "../config/db";

const router = Router();

router.get("/orders-per-day", async (request, response, next) => {
  const days = Number(request.query.days ?? 30);
  if (!Number.isSafeInteger(days) || days < 1 || days > 365) {
    response.status(400).json({ error: "days must be an integer from 1 to 365" });
    return;
  }
  try {
    const [rows] = await pool.query(
      `SELECT order_day, COUNT(*) AS order_count
       FROM (
         SELECT DATE(created_at) AS order_day FROM orders
         WHERE created_at >= DATE_SUB(UTC_TIMESTAMP(), INTERVAL ? DAY)
         UNION ALL
         SELECT DATE(created_at) AS order_day FROM orders_archive
         WHERE created_at >= DATE_SUB(UTC_TIMESTAMP(), INTERVAL ? DAY)
       ) all_orders
       GROUP BY order_day ORDER BY order_day`,
      [days, days],
    );
    response.json(rows);
  } catch (error) {
    next(error);
  }
});

router.get("/revenue-per-store", async (_request, response, next) => {
  try {
    const [rows] = await pool.query(
      `SELECT store_id, SUM(total_amount) AS total_revenue, COUNT(*) AS order_count
       FROM (
         SELECT store_id, total_amount FROM orders
         UNION ALL
         SELECT store_id, total_amount FROM orders_archive
       ) all_orders
       GROUP BY store_id ORDER BY total_revenue DESC`,
    );
    response.json(rows);
  } catch (error) {
    next(error);
  }
});

router.get("/top-items", async (_request, response, next) => {
  try {
    const [rows] = await pool.query(
      `SELECT item_id, SUM(qty) AS units_sold
       FROM (
         SELECT item_id, qty FROM order_items
         UNION ALL
         SELECT item_id, qty FROM order_items_archive
       ) all_items
       GROUP BY item_id ORDER BY units_sold DESC, item_id ASC LIMIT 5`,
    );
    response.json(rows);
  } catch (error) {
    next(error);
  }
});

export { router as analyticsRouter };
