import type { Db } from "@evzla/db/client";

export type RpcExecutor = Pick<Db, "execute">;
