import { Server } from "socket.io";

let socketServer: Server | undefined;

export function initializeSocket(server: import("node:http").Server, origin: string) {
  socketServer = new Server(server, { cors: { origin } });
  socketServer.on("connection", (socket) => {
    socket.on("store:join", (storeId: unknown) => {
      if (typeof storeId === "string" && storeId.trim()) {
        void socket.join(`store:${storeId.trim()}`);
      }
    });
    socket.on("store:leave", (storeId: unknown) => {
      if (typeof storeId === "string" && storeId.trim()) {
        void socket.leave(`store:${storeId.trim()}`);
      }
    });
  });
  return socketServer;
}

export function getSocketServer(): Server {
  if (!socketServer) {
    throw new Error("Socket.IO has not been initialized");
  }
  return socketServer;
}
