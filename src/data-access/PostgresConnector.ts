import { Client, Pool } from "pg";
import pgvector from "pgvector/pg";
export class PostgresConnector {
  private postgresConnector: Pool;
  constructor() {
    this.postgresConnector = new Pool({
      connectionString: process.env.DATABASE_URL,
      max: 10,
      idleTimeoutMillis: 50_000,
      connectionTimeoutMillis: 3_000,
    });

    this.postgresConnector.on("connect", (client) => {
      pgvector.registerTypes(client);
    });
  }

  public async connect() {
    await this.postgresConnector.connect();
  }

  public async getConnection() {
    return this.postgresConnector;
  }
}
