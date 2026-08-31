import { text } from "body-parser";
import { ChatMessage } from "../../application/services/QueryService";
interface OllamaChatResponse {
  message: { role: string; content: string };
}

interface OllamaEmbeddings {
  embeddings: number[][];
}
export class OllamaClient {
  public async generateChatReseponse(messages: ChatMessage[]) {
    const response = await fetch(`${process.env.OLLAMA_BASE_URL}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: process.env.CHAT_MODEL,
        messages: messages,
        stream: false,
        options: { temperature: 0 },
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(
        `Generování selhalo (HTTP ${response.status}): ${errorText}. ` +
          `Je stažený model ${process.env.CHAT_MODEL}?`,
      );
    }

    const responseBody = (await response.json()) as OllamaChatResponse;
    return responseBody.message.content;
  }

  public async createEmbeddings(texts: any[]) {
    const response = await fetch(`${process.env.OLLAMA_BASE_URL}/api/embed`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: process.env.EMBEDDING_MODEL,
        input: texts,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(
        `Generování selhalo (HTTP ${response.status}): ${errorText}. ` +
          `Je stažený model ${process.env.CHAT_MODEL}?`,
      );
    }

    const responseBody = (await response.json()) as OllamaEmbeddings;
    return responseBody.embeddings;
  }

  public async getOneEmbedding(text: string): Promise<number[]> {
    const [embedding] = await this.createEmbeddings([text]);
    if (!embedding) {
      throw new Error("Ollama nevrátila embedding.");
    }
    return embedding;
  }
}
