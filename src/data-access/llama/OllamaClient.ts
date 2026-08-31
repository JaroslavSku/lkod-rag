import { inject, injectable } from "tsyringe";
import type { IAppConfig } from "../../config/AppConfig";
import { AppToken } from "../../ioc/AppToken";

export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

interface IOllamaChatResponse {
  message: { role: string; content: string };
}

interface IOllamaEmbeddingsResponse {
  embeddings: number[][];
}

@injectable()
export class OllamaClient {
  constructor(
    @inject(AppToken.AppConfig) private readonly config: IAppConfig,
  ) {}

  public async generateChatResponse(messages: ChatMessage[]): Promise<string> {
    const response = await fetch(`${this.config.ollamaBaseUrl}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: this.config.chatModel,
        messages,
        stream: false,
        options: { temperature: 0 },
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(
        `Ollama chat request failed (HTTP ${response.status}): ${errorText}. ` +
          `Is the model ${this.config.chatModel} pulled?`,
      );
    }

    const responseBody = (await response.json()) as IOllamaChatResponse;
    return responseBody.message.content;
  }

  public async createEmbeddings(texts: string[]): Promise<number[][]> {
    const response = await fetch(`${this.config.ollamaBaseUrl}/api/embed`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: this.config.embeddingModel,
        input: texts,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(
        `Ollama embedding request failed (HTTP ${response.status}): ${errorText}. ` +
          `Is the model ${this.config.embeddingModel} pulled?`,
      );
    }

    const responseBody = (await response.json()) as IOllamaEmbeddingsResponse;
    return responseBody.embeddings;
  }

  public async getOneEmbedding(text: string): Promise<number[]> {
    const [embedding] = await this.createEmbeddings([text]);
    if (!embedding) {
      throw new Error("Ollama returned no embedding.");
    }
    return embedding;
  }
}
