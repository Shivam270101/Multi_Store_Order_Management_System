import "dotenv/config";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import mysql from "mysql2/promise";

async function initializeDatabase() {
  const schema = await readFile(join(__dirname, "../../sql/schema.sql"), "utf8");
  const connection = await mysql.createConnection({
    host: process.env.DB_HOST ?? "localhost",
    port: Number(process.env.DB_PORT ?? 3306),
    user: process.env.DB_USER ?? "root",
    password: process.env.DB_PASSWORD ?? "",
    multipleStatements: true,
  });

  try {
    await connection.query(schema);
    console.log("MySQL schema initialized.");
  } finally {
    await connection.end();
  }
}

void initializeDatabase().catch((error: unknown) => {
  console.error("Failed to initialize the MySQL schema:", error);
  process.exitCode = 1;
});
