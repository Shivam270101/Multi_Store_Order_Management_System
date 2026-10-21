require("dotenv").config();
const mysql = require("mysql2/promise");

async function cleanSmokeTestOrder() {
  const connection = await mysql.createConnection({
    host: process.env.DB_HOST ?? "localhost",
    port: Number(process.env.DB_PORT ?? 3306),
    user: process.env.DB_USER ?? "root",
    password: process.env.DB_PASSWORD ?? "root",
    database: process.env.DB_NAME ?? "multi_store_orders",
  });

  try {
    await connection.execute(
      "DELETE FROM orders WHERE id = ? AND store_id LIKE ?",
      [1, "__smoke_%"],
    );
    console.log("Smoke-test record cleanup completed.");
  } finally {
    await connection.end();
  }
}

cleanSmokeTestOrder().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
