import { Router } from "express";
import type { RowDataPacket } from "mysql2";

import { pool } from "../config/db";

const router = Router();

router.get("/", async (_request, response, next) => {
  try {
    const [rows] = await pool.query<
      Array<
        RowDataPacket & {
          item_id: string;
          name: string;
          category: string;
          price: number;
          available: number;
        }
      >
    >(
      `SELECT item_id, name, category, price, available
       FROM dishes WHERE available = TRUE ORDER BY category, name`,
    );
    response.json(
      rows.map((dish) => ({ ...dish, price: Number(dish.price), available: Boolean(dish.available) })),
    );
  } catch (error) {
    next(error);
  }
});

export { router as dishesRouter };
