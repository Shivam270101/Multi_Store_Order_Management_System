import cors from "cors";
import "dotenv/config";
import express from "express";
import { createServer } from "node:http";

import { pool } from "./db";
import { initializeSocket } from "./socket";
import { analyticsRouter } from "../routes/analytics";
import { archiveRouter } from "../routes/archive";
import { dishesRouter } from "../routes/dishes";
import { ordersRouter } from "../routes/orders";

const app = express();
const httpServer = createServer(app);
const frontendUrl = process.env.FRONTEND_URL ?? "http://localhost:3000";
const port = Number(process.env.PORT ?? 4000);

initializeSocket(httpServer, frontendUrl);

app.use(cors({ origin: frontendUrl }));
app.use(express.json({ limit: "1mb" }));
app.get("/health", (_request, response) => response.json({ status: "ok" }));
app.use("/orders", ordersRouter);
app.use("/dishes", dishesRouter);
app.use("/archive-old-orders", archiveRouter);
app.use("/analytics", analyticsRouter);
app.use(
  (
    error: unknown,
    _request: express.Request,
    response: express.Response,
    _next: express.NextFunction,
  ) => {
    console.error(error);
    response.status(500).json({ error: "Internal server error" });
  },
);

httpServer.listen(port, () => {
  console.log(`Order API listening on http://localhost:${port}`);
});

async function shutdown() {
  await new Promise<void>((resolve, reject) => {
    httpServer.close((error) => (error ? reject(error) : resolve()));
  });
  await pool.end();
}

process.on("SIGINT", () => void shutdown());
process.on("SIGTERM", () => void shutdown());