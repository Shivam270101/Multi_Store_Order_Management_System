import { Server } from "socket.io";

import {
  allStoresRoom,
  storeRoom,
  type DeletedOrder,
  type Order,
} from "../domain/order";

interface ClientToServerEvents {
  "store:join": (storeId: unknown) => void;
  "store:leave": (storeId: unknown) => void;
  "stores:subscribe": (storeId: unknown) => void;
}

interface ServerToClientEvents {
  "order:created": (order: Order) => void;
  "order:updated": (order: Order) => void;
  "order:deleted": (order: DeletedOrder) => void;
}

type SocketServer = Server<ClientToServerEvents, ServerToClientEvents>;

let socketServer: SocketServer | undefined;

function normalizedStoreId(value: unknown): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }
  const storeId = value.trim();
  return storeId.length > 0 && storeId.length <= 100 ? storeId : undefined;
}

export function initializeSocket(
  server: import("node:http").Server,
  origin: string,
): SocketServer {
  socketServer = new Server<ClientToServerEvents, ServerToClientEvents>(server, {
    cors: { origin },
    connectionStateRecovery: { maxDisconnectionDuration: 120_000 },
  });
  socketServer.on("connection", (socket) => {
    let subscriptionRevision = 0;
    let subscriptionQueue = Promise.resolve();

    socket.on("store:join", (value) => {
      const storeId = normalizedStoreId(value);
      if (storeId) {
        void socket.join(storeRoom(storeId));
      }
    });
    socket.on("store:leave", (value) => {
      const storeId = normalizedStoreId(value);
      if (storeId) {
        void socket.leave(storeRoom(storeId));
      }
    });
    socket.on("stores:subscribe", (value) => {
      const storeId = value === null ? undefined : normalizedStoreId(value);
      if (value !== null && !storeId) {
        return;
      }

      const revision = ++subscriptionRevision;
      subscriptionQueue = subscriptionQueue
        .then(async () => {
          if (revision !== subscriptionRevision) {
            return;
          }
          const roomsToLeave = Array.from(socket.rooms).filter(
            (room) => room === allStoresRoom || room.startsWith("store:"),
          );
          await Promise.all(roomsToLeave.map((room) => socket.leave(room)));
          if (revision === subscriptionRevision) {
            await socket.join(storeId ? storeRoom(storeId) : allStoresRoom);
          }
        })
        .catch((error: unknown) => {
          console.error("Failed to update Socket.IO store subscription", error);
        });
    });
  });
  return socketServer;
}

export function emitOrderCreated(order: Order): void {
  getSocketServer()
    .to(storeRoom(order.store_id))
    .to(allStoresRoom)
    .emit("order:created", order);
}

export function emitOrderUpdated(order: Order): void {
  getSocketServer()
    .to(storeRoom(order.store_id))
    .to(allStoresRoom)
    .emit("order:updated", order);
}

export function emitOrderDeleted(order: DeletedOrder): void {
  getSocketServer()
    .to(storeRoom(order.store_id))
    .to(allStoresRoom)
    .emit("order:deleted", order);
}

export function getSocketServer(): SocketServer {
  if (!socketServer) {
    throw new Error("Socket.IO has not been initialized");
  }
  return socketServer;
}
