import { Pool, type PoolClient } from "@neondatabase/serverless";
import { neonConfig } from "@neondatabase/serverless";
import { getSql } from "./client";

export type SqlTag = ReturnType<typeof getSql>;

export function makeSqlTag(client: Pick<PoolClient, "query">): SqlTag {
  const sql = (async (strings: TemplateStringsArray, ...values: unknown[]) => {
    const text = strings.reduce((acc, part, index) => {
      const placeholder = index < values.length ? `$${index + 1}` : "";
      return acc + part + placeholder;
    }, "");
    const result = await client.query(text, values as unknown[]);
    return result.rows;
  }) as SqlTag;

  return sql;
}

export function createTransactionPool(connectionString: string): Pool {
  if (typeof WebSocket !== "undefined") {
    neonConfig.webSocketConstructor = WebSocket;
  }

  return new Pool({ connectionString });
}

export async function withTransaction<T>(
  pool: Pool,
  work: (sql: SqlTag, client: PoolClient) => Promise<T>
): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const sql = makeSqlTag(client);
    const result = await work(sql, client);
    await client.query("COMMIT");
    return result;
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}


