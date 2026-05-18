"use client";

// Main-thread API for the browser-side SQLite. Spawns the worker lazily
// on first use, multiplexes requests by id, and exposes a Promise-based
// SQL surface. Singleton per tab.

import type { ClientToWorker, SqlParams, SqlRow, WorkerToClient } from "./protocol";

export type ExecResult = {
  rows: SqlRow[];
  changes: number;
};

type Pending = {
  resolve: (result: ExecResult) => void;
  reject: (error: Error) => void;
};

class LocalDb {
  private worker: Worker | null = null;
  private nextId = 1;
  private pending = new Map<number, Pending>();
  private readyPromise: Promise<void> | null = null;
  private initPromise: Promise<void> | null = null;

  private spawn(): Worker {
    if (this.worker) return this.worker;

    const worker = new Worker(new URL("./worker.ts", import.meta.url), {
      type: "module",
      name: "mcr-admin-local-db"
    });

    this.readyPromise = new Promise<void>((resolve) => {
      const onReady = (ev: MessageEvent<WorkerToClient>) => {
        if (!("id" in ev.data) && ev.data.kind === "ready") {
          worker.removeEventListener("message", onReady);
          resolve();
        }
      };
      worker.addEventListener("message", onReady);
    });

    worker.addEventListener("message", (ev: MessageEvent<WorkerToClient>) => {
      const msg = ev.data;
      if (!("id" in msg)) return;
      const entry = this.pending.get(msg.id);
      if (!entry) return;
      this.pending.delete(msg.id);
      if (msg.kind === "ok") {
        entry.resolve({ rows: msg.rows, changes: msg.changes });
      } else {
        entry.reject(new Error(msg.error));
      }
    });

    worker.addEventListener("error", (ev) => {
      // Unrecoverable worker error: reject all pending and reset so the next
      // call respawns a fresh worker.
      const error = new Error(ev.message || "Local DB worker crashed");
      for (const [id, entry] of this.pending) {
        entry.reject(error);
        this.pending.delete(id);
      }
      this.worker = null;
      this.readyPromise = null;
      this.initPromise = null;
    });

    this.worker = worker;
    return worker;
  }

  private sendMessage(msg: ClientToWorker): Promise<ExecResult> {
    const worker = this.spawn();
    return new Promise<ExecResult>((resolve, reject) => {
      this.pending.set(msg.id, { resolve, reject });
      worker.postMessage(msg);
    });
  }

  async init(): Promise<void> {
    if (this.initPromise) return this.initPromise;
    this.initPromise = (async () => {
      this.spawn();
      await this.readyPromise;
      const id = this.nextId++;
      await this.sendMessage({ id, kind: "init" });
    })();
    return this.initPromise;
  }

  async exec(sql: string, params: SqlParams = []): Promise<ExecResult> {
    await this.init();
    const id = this.nextId++;
    return this.sendMessage({ id, kind: "exec", sql, params });
  }

  async query<T extends SqlRow = SqlRow>(sql: string, params: SqlParams = []): Promise<T[]> {
    const result = await this.exec(sql, params);
    return result.rows as T[];
  }
}

let instance: LocalDb | null = null;

export function getLocalDb(): LocalDb {
  if (typeof window === "undefined") {
    throw new Error("Local DB is browser-only. Call from a client component.");
  }
  instance ??= new LocalDb();
  return instance;
}
