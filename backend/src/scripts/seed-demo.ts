import "dotenv/config";

import { pool } from "../config/db";
import type { OrderStatus } from "../domain/order";

const dishes = [
  ["margherita-pizza", "Margherita Pizza", "Pizza", 12.5],
  ["pepperoni-pizza", "Pepperoni Pizza", "Pizza", 14.5],
  ["veggie-pizza", "Garden Veggie Pizza", "Pizza", 13.75],
  ["bbq-chicken-pizza", "BBQ Chicken Pizza", "Pizza", 15.25],
  ["classic-burger", "Classic Cheeseburger", "Burgers", 11.5],
  ["double-burger", "Double Stack Burger", "Burgers", 14.25],
  ["veggie-burger", "Crispy Veggie Burger", "Burgers", 10.75],
  ["chicken-burger", "Grilled Chicken Burger", "Burgers", 12.25],
  ["caesar-salad", "Chicken Caesar Salad", "Salads", 10.5],
  ["greek-salad", "Mediterranean Greek Salad", "Salads", 9.25],
  ["garden-salad", "Garden Harvest Salad", "Salads", 8.75],
  ["fries", "Sea Salt Fries", "Sides", 4.5],
  ["onion-rings", "Crispy Onion Rings", "Sides", 5.25],
  ["mozzarella-sticks", "Mozzarella Sticks", "Sides", 6.5],
  ["chicken-wings", "Buffalo Chicken Wings", "Sides", 9.75],
  ["tomato-soup", "Roasted Tomato Soup", "Soups", 6.25],
  ["mushroom-soup", "Creamy Mushroom Soup", "Soups", 6.75],
  ["mac-and-cheese", "Baked Mac and Cheese", "Mains", 10.25],
  ["fish-and-chips", "Fish and Chips", "Mains", 15.5],
  ["chicken-pasta", "Creamy Chicken Pasta", "Mains", 13.5],
  ["veggie-pasta", "Pesto Veggie Pasta", "Mains", 12.75],
  ["steak-bowl", "Teriyaki Steak Bowl", "Mains", 16.25],
  ["chicken-bowl", "Crispy Chicken Rice Bowl", "Mains", 12.5],
  ["veggie-bowl", "Roasted Veggie Bowl", "Mains", 11.25],
  ["chocolate-cake", "Chocolate Fudge Cake", "Desserts", 6.25],
  ["cheesecake", "New York Cheesecake", "Desserts", 6.5],
  ["apple-pie", "Warm Apple Pie", "Desserts", 5.75],
  ["ice-cream", "Vanilla Bean Ice Cream", "Desserts", 4.25],
  ["lemonade", "Fresh Lemonade", "Drinks", 3.5],
  ["iced-tea", "Peach Iced Tea", "Drinks", 3.25],
  ["chole-bhature", "Chole Bhature", "Indian", 12],
  ["pav-bhaji", "Pav Bhaji", "Indian", 120],
] as const;

const statuses: OrderStatus[] = ["PLACED", "PREPARING", "COMPLETED"];
const stores = ["store-1", "store-2", "store-3"];

async function seedDemoData() {
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();

    for (const [itemId, name, category, price] of dishes) {
      await connection.execute(
        `INSERT INTO dishes (item_id, name, category, price)
         VALUES (?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE item_id = VALUES(item_id)`,
        [itemId, name, category, price],
      );
    }
    await connection.execute(
      "UPDATE dishes SET available = TRUE WHERE item_id IN (?, ?)",
      ["chole-bhature", "pav-bhaji"],
    );

    const [existing] = await connection.execute(
      "SELECT seed_key FROM demo_seed_runs WHERE seed_key = ? FOR UPDATE",
      ["sample-orders-v1"],
    );
    if ((existing as Array<{ seed_key: string }>).length === 0) {
      for (let index = 0; index < 30; index += 1) {
        const storeId = stores[index % stores.length]!;
        const firstDish = dishes[(index * 3) % dishes.length]!;
        const secondDish = dishes[(index * 3 + 7) % dishes.length]!;
        const qty = (index % 3) + 1;
        const secondQty = (index % 2) + 1;
        const totalAmount = Number((firstDish[3] * qty + secondDish[3] * secondQty).toFixed(2));
        const status = statuses[index % statuses.length]!;
        const createdAt = new Date(Date.now() - index * 60 * 60 * 1000);
        const [result] = await connection.execute(
          "INSERT INTO orders (store_id, total_amount, status, created_at) VALUES (?, ?, ?, ?)",
          [storeId, totalAmount, status, createdAt],
        );
        const orderId = (result as { insertId: number }).insertId;
        await connection.execute(
          `INSERT INTO order_items (order_id, item_id, qty, unit_price)
           VALUES (?, ?, ?, ?), (?, ?, ?, ?)`,
          [
            orderId,
            firstDish[0],
            qty,
            firstDish[3],
            orderId,
            secondDish[0],
            secondQty,
            secondDish[3],
          ],
        );
      }
      await connection.execute(
        "INSERT INTO demo_seed_runs (seed_key) VALUES (?)",
        ["sample-orders-v1"],
      );
    }

    await connection.commit();
    console.log(
      `Seeded ${dishes.length} dishes and ${stores.length} demo stores. Sample orders are created only once.`,
    );
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
    await pool.end();
  }
}

seedDemoData().catch((error: unknown) => {
  console.error("Failed to seed demo data:", error);
  process.exitCode = 1;
});
