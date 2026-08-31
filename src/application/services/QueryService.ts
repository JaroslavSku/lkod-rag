import pgvector from "pgvector/pg";
import { inject, injectable } from "tsyringe";
import type { IAppConfig } from "../../config/AppConfig";
import type { ChatMessage } from "../../data-access/llama/OllamaClient";
import { OllamaClient } from "../../data-access/llama/OllamaClient";
import { PostgresConnector } from "../../data-access/PostgresConnector";
import { AppToken } from "../../ioc/AppToken";

export interface IDatabaseRow {
  id: number;
  title: string;
  filename: string;
  rank?: string;
  snippet?: string;
  distance?: number;
  content: string;
}

@injectable()
export class QueryService {
  private readonly NOT_FOUND_ANSWER =
    "Tuto informaci jsem v dokumentu nenašel.";

  constructor(
    @inject(AppToken.PostgresConnector)
    private readonly dbClient: PostgresConnector,
    @inject(AppToken.OllamaClient)
    private readonly ollamaClient: OllamaClient,
    @inject(AppToken.AppConfig) private readonly config: IAppConfig,
  ) {}

  private async getLexicalContext(query: string): Promise<IDatabaseRow[]> {
    const client = await this.dbClient.getConnection();
    const result = await client.query(
      `SELECT
        id, title, filename, content,
        ts_rank(fts, query) AS rank,
        ts_headline('czech', content, query) AS snippet
        FROM lkod_search_vectors, plainto_tsquery('czech', $1) query
        WHERE fts @@ query
        ORDER BY rank DESC
        LIMIT $2`,
      [query, this.config.retrievalLimit],
    );

    return result.rows as IDatabaseRow[];
  }

  private async getSemanticalContext(query: string): Promise<IDatabaseRow[]> {
    const client = await this.dbClient.getConnection();
    const embedding = await this.ollamaClient.getOneEmbedding(query);
    const result = await client.query(
      `SELECT id, title, filename, content, embedding <=> $1 AS distance FROM lkod_search_vectors
       WHERE embedding IS NOT NULL
       ORDER BY embedding <=> $1 LIMIT $2`,
      [pgvector.toSql(embedding), this.config.retrievalLimit],
    );

    return result.rows as IDatabaseRow[];
  }

  public addScore(
    lexicalContext: IDatabaseRow[],
    semanticContext: IDatabaseRow[],
  ): IDatabaseRow[] {
    const scoreMap = new Map<number, number>();
    const rowsById = new Map<number, IDatabaseRow>();

    const createRankedRisk = (rows: IDatabaseRow[]) =>
      rows.forEach((row, index) => {
        const score = scoreMap.get(row.id) || 0;
        scoreMap.set(row.id, score + 1 / (this.config.rrfK + index + 1));
        rowsById.set(row.id, row);
      });
    createRankedRisk(lexicalContext);
    createRankedRisk(semanticContext);
    return this.createScoreOutput(scoreMap, rowsById);
  }

  private createScoreOutput(
    scoreMap: Map<number, number>,
    rowsById: Map<number, IDatabaseRow>,
  ): IDatabaseRow[] {
    return [...scoreMap.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([key, _]) => rowsById.get(key)!);
  }

  public buildContextBloc(rows: IDatabaseRow[]): string {
    return rows
      .map(
        (row, position) =>
          `[${position + 1}] title: ${row.title}\n${row.snippet ?? row.content}`,
      )
      .join("\n\n---\n\n");
  }

  public createPrompt(rows: IDatabaseRow[], question: string): ChatMessage[] {
    const basePrompt = `Jsi precizní asistent pro práci s dokumenty.
        PRAVIDLA:
        1. Odpovídej VÝHRADNĚ na základě informací v sekci KONTEXT.
        2. Pokud odpověď v kontextu není, napiš přesně: "${this.NOT_FOUND_ANSWER}"
        3. Nikdy nedoplňuj informace z vlastních znalostí.
        4. U každého tvrzení uveď zdroj ve tvaru [1], [2] podle číslování v kontextu.
        5. Odpovídej stručně a v jazyce otázky.`;

    return [
      { role: "system", content: basePrompt },
      {
        role: "user",
        content: `### KONTEXT\n${this.buildContextBloc(rows)}\n\n### OTÁZKA\n${question}`,
      },
    ];
  }

  public async returnQueryResult(query: string): Promise<string> {
    const [lexicalContext, semanticContext] = await Promise.all([
      this.getLexicalContext(query),
      this.getSemanticalContext(query),
    ]);

    const mergedContextWithScore = this.addScore(
      lexicalContext,
      semanticContext,
    );
    if (mergedContextWithScore.length === 0) {
      return this.NOT_FOUND_ANSWER;
    }

    const messages = this.createPrompt(mergedContextWithScore, query);
    return this.ollamaClient.generateChatResponse(messages);
  }
}
