import { drizzle } from "drizzle-orm/node-postgres";
import type { Pool } from "pg";
import * as schema from "../schema";

export function createDrizzleStore(pool: Pool) {
  const db = drizzle(pool, { schema });

  return { db };
}
