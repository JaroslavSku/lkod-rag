import path from "node:path";
import { PostgresConnector } from "../../data-access/PostgresConnector";
import { readFileSync } from "node:fs";
import { OllamaClient } from "../../data-access/llama/OllamaClient";
import pgvector from "pgvector/pg";

export class CreateContextService {
  constructor(
    private dbClient: PostgresConnector,
    private ollamaClient: OllamaClient,
  ) {}

  public async saveToDb() {
    const fileName = `${process.cwd()}\\${process.env.CHATBOT_CONTEXT_FILE}`;
    const md = readFileSync(fileName, { encoding: "utf-8" });
    const sections = md.split(/^## /m);

    const client = await this.dbClient.getConnection();
    await client.query("DELETE FROM lkod_search_vectors WHERE filename = $1", [
      fileName,
    ]);

    for (const section of sections) {
      if (!section.trim()) continue;
      const lines = section.split("\n");
      const title = lines.shift();
      const content = lines.join();

      const embedding = await this.ollamaClient.getOneEmbedding(content);

      await client.query(
        "INSERT INTO lkod_search_vectors (title, filename, content, embedding) VALUES ($1, $2, $3, $4)",
        [title, fileName, content, pgvector.toSql(embedding)],
      );
    }
  }

  public async backfillEmbeddings(): Promise<void> {
    const client = await this.dbClient.getConnection();
    const { rows } = await client.query(
      "SELECT id, content FROM lkod_search_vectors WHERE embedding IS NULL",
    );

    for (const row of rows) {
      const embedding = await this.ollamaClient.getOneEmbedding(row.content);
      await client.query(
        "UPDATE lkod_search_vectors SET embedding = $1 WHERE id = $2",
        [pgvector.toSql(embedding), row.id],
      );
    }
  }
}
