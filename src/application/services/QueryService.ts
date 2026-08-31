import pgvector from "pgvector/pg";
import { OllamaClient } from "../../data-access/llama/OllamaClient";
import { PostgresConnector } from "../../data-access/PostgresConnector";

interface IDatabaseRow {
  id: number;
  title: string;
  filename: string;
  rank: string;
  snippet: string;
  distance: number;
  content: string;
}

export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export class QueryService {
  private readonly NOT_FOUND_ANSWER =
    "Tuto informaci jsem v dokumentu nenašel.";
  constructor(
    private dbClient: PostgresConnector,
    private ollamaClient: OllamaClient,
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
        LIMIT 5`,
      [query],
    );
    console.log(result);
    if (!result.rows[0]) {
      console.log("Data are empty");
    }
    return result.rows as IDatabaseRow[];
  }

  private async getSemanticalContext(query: string): Promise<IDatabaseRow[]> {
    const client = await this.dbClient.getConnection();
    const embedding = await this.ollamaClient.getOneEmbedding(query);
    const result = await client.query(
      `SELECT id, title, filename, content, embedding <=> $1 AS distance FROM lkod_search_vectors
       ORDER BY embedding <=> $1 LIMIT 5`,
      [pgvector.toSql(embedding)],
    );
    if (!result.rows[0]) {
      console.log("Semantical result is empty.");
    }

    return result.rows as IDatabaseRow[];
  }

  private buildContextBloc(rows: IDatabaseRow[]) {
    const context = [];
    let i = 0;
    for (const row of rows) {
      const header = `[${i}] rank: ${i} title: ${row.content}`;
      context.push(`${header}\n${row.snippet}`);
      i++;
    }

    return context;
  }

  private createPrompt(rows: IDatabaseRow[], question: string): ChatMessage[] {
    const basePrompt = `Jsi precizní asistent pro práci s dokumenty.
        PRAVIDLA:
        1. Odpovídej VÝHRADNĚ na základě informací v sekci KONTEXT.
        2. Pokud odpověď v kontextu není, napiš přesně: "${this.NOT_FOUND_ANSWER}"
        3. Nikdy nedoplňuj informace z vlastních znalostí.
        4. Odpovídej stručně a v jazyce otázky.`;

    const messages: ChatMessage[] = [
      {
        role: "system",
        content: basePrompt,
      },
      {
        role: "user",
        content: `### KONTEXT\n${this.buildContextBloc(rows)}\n\n### OTÁZKA\n${question}`,
      },
    ];

    return messages;
  }

  // vychazi se z toho ze stejne radky maji stejny title protoze stejna tabulka
  private addScore(
    lexicalContext: IDatabaseRow[],
    semanticContext: IDatabaseRow[],
  ): IDatabaseRow[] {
    const scoreMap = new Map<number, number>();
    const rowsById = new Map<number, IDatabaseRow>();

    const createRankedRisk = (rows: IDatabaseRow[]) =>
      rows.forEach((row, index) => {
        const score = scoreMap.get(row.id) || 0;
        scoreMap.set(row.id, score + 1 / (60 + row.id + 1));
        rowsById.set(row.id, row);
      });
    createRankedRisk(lexicalContext);
    createRankedRisk(semanticContext);
    return this.createScoreOutput(scoreMap, rowsById);
  }

  private createScoreOutput(
    scoreMap: Map<number, number>,
    rowsById: Map<number, IDatabaseRow>,
  ) {
    return [...scoreMap.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([key, _]) => rowsById.get(key)!);
  }

  public async returnQueryResult(query: string): Promise<string> {
    const lexicalContext = await this.getLexicalContext(query);
    const semanticContext = await this.getSemanticalContext(query);
    const mergedContextWithScore = await this.addScore(
      lexicalContext,
      semanticContext,
    );
    if (mergedContextWithScore.length === 0) {
      return this.NOT_FOUND_ANSWER;
    }
    const messages = this.createPrompt(mergedContextWithScore, query);
    const ollamaResponse = this.ollamaClient.generateChatReseponse(messages!);
    return ollamaResponse;
  }
}
