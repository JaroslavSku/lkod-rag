import { Pool } from "pg";
import pgvector from "pgvector/pg";
import { inject, injectable } from "tsyringe";
import type { IAppConfig } from "../config/AppConfig";
import { AppToken } from "../ioc/AppToken";

@injectable()
export class PostgresConnector {
  private readonly pool: Pool;

  constructor(@inject(AppToken.AppConfig) private readonly config: IAppConfig) {
    this.pool = new Pool({
      connectionString: this.config.databaseUrl,
      application_name: this.config.appName,
      max: this.config.postgresPoolMaxConnections,
      idleTimeoutMillis: this.config.postgresIdleTimeoutMs,
      connectionTimeoutMillis: this.config.postgresConnectionTimeoutMs,
    });

    this.pool.on("connect", (client) => {
      pgvector.registerTypes(client);
    });
  }

  public async connect(): Promise<void> {
    const client = await this.pool.connect();
    try {
      await client.query("SELECT 1");
    } finally {
      client.release();
    }
  }

  public async disconnect(): Promise<void> {
    await this.pool.end();
  }

  public async getConnection(): Promise<Pool> {
    return this.pool;
  }
}
