import express from "express";
import path from "path";
import { fileURLToPath } from "url";
import { createServer as createViteServer } from "vite";
import { WebSocketServer } from "ws";
import http from "http";
import crypto from "crypto";
import {
  type RefundStats,
  type Transaction,
  type TransactionsResponse,
  type CreateTransactionRequest,
  type ServerEvent,
} from "@shared/types";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const isProduction = process.env.NODE_ENV === "production";
const PORT = Number(process.env.PORT ?? 5000);

const app = express();
app.use(express.json());

const transactions: Transaction[] = [];
const uniqueWallets = new Set<string>();
let wss: WebSocketServer | null = null;

function generateSignature() {
  return crypto.randomBytes(32).toString("hex");
}

function addTransaction(entry: Omit<Transaction, "id" | "createdAt" | "txSignature"> & {
  txSignature?: string;
  createdAt?: string;
}) {
  const createdAt = entry.createdAt ?? new Date().toISOString();
  const transaction: Transaction = {
    id: crypto.randomUUID(),
    walletAddress: entry.walletAddress,
    accountsClosed: entry.accountsClosed,
    refundedSol: entry.refundedSol,
    txSignature: entry.txSignature ?? generateSignature(),
    createdAt,
  };
  transactions.unshift(transaction);
  uniqueWallets.add(transaction.walletAddress);
  recalcStats();
  broadcast({ type: "transaction", payload: transaction });
  broadcast({ type: "stats", payload: stats });
  return transaction;
}

let stats: RefundStats = {
  totalUsers: 0,
  totalAccountsClosed: 0,
  totalSolRefunded: 0,
  lastUpdated: new Date().toISOString(),
};

function recalcStats() {
  stats = {
    totalUsers: uniqueWallets.size,
    totalAccountsClosed: transactions.reduce(
      (acc, item) => acc + item.accountsClosed,
      0,
    ),
    totalSolRefunded: Number(
      transactions
        .reduce((acc, item) => acc + item.refundedSol, 0)
        .toFixed(2),
    ),
    lastUpdated: new Date().toISOString(),
  };
}

function seedData() {
  const wallets = [
    "9sVn1Gv1dQxwT4sAX9JUo9wTpeB6mFDZcnQ1kz7mLREF",
    "D4ftr7W9psH9M2sQ1wzF6nJ8kL2pQ7xT1yV5bC3nMvPQ",
    "7QwLp9sF4kT2vX6nR1pZ8mB3cH7tY5dL2sV9qK4jFtGh",
    "A1sD3fG5hJ7kL9zX2cV4bN6mQ8wE1rT3yU5iO7pL9aSd",
    "C9vB7nM5qL3kJ1hG7fD5sA3pL9oK7iU5yT3rE1wQ9zX7",
  ];

  wallets.forEach((wallet, index) => {
    addTransaction({
      walletAddress: wallet,
      accountsClosed: 3 + index,
      refundedSol: 1.45 + index * 0.37,
      createdAt: new Date(Date.now() - index * 3600_000).toISOString(),
    });
  });
}

seedData();

const server = http.createServer(app);

function broadcast(event: ServerEvent) {
  if (!wss) return;
  const message = JSON.stringify(event);
  wss.clients.forEach((client) => {
    if (client.readyState === client.OPEN) {
      client.send(message);
    }
  });
}

app.get("/api/stats", (_req, res) => {
  res.json(stats);
});

app.get("/api/transactions", (req, res) => {
  const page = Math.max(Number(req.query.page) || 1, 1);
  const pageSize = Math.min(Math.max(Number(req.query.pageSize) || 10, 1), 50);
  const start = (page - 1) * pageSize;
  const end = start + pageSize;
  const slice = transactions.slice(start, end);
  const response: TransactionsResponse = {
    transactions: slice,
    page,
    pageSize,
    hasMore: end < transactions.length,
  };
  res.json(response);
});

app.post("/api/transactions", (req, res) => {
  const body: CreateTransactionRequest = req.body ?? {};
  if (!body.walletAddress || body.accountsClosed <= 0 || body.refundedSol <= 0) {
    return res.status(400).json({
      error: "walletAddress, accountsClosed, and refundedSol are required",
    });
  }

  const transaction = addTransaction({
    walletAddress: body.walletAddress,
    accountsClosed: body.accountsClosed,
    refundedSol: body.refundedSol,
    txSignature: body.txSignature,
  });

  res.status(201).json(transaction);
});

app.get("/health", (_req, res) => {
  res.json({ status: "ok" });
});

async function bootstrap() {
  if (!isProduction) {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      root: path.resolve(__dirname, "../client"),
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.resolve(__dirname, "../dist/public");
    app.use(express.static(distPath));
    app.use((req, res, next) => {
      if (req.method.toLowerCase() !== "get") {
        return next();
      }
      return res.sendFile(path.join(distPath, "index.html"));
    });
  }

  wss = new WebSocketServer({ server, path: "/ws" });

  wss.on("connection", (socket) => {
    socket.send(
      JSON.stringify({ type: "stats", payload: stats } satisfies ServerEvent),
    );
  });

  server.listen(PORT, () => {
    console.log(`Server listening on port ${PORT}`);
  });
}

bootstrap().catch((error) => {
  console.error("Failed to bootstrap server", error);
  process.exit(1);
});
