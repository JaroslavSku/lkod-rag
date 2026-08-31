# lkod-rag

Hybrid RAG API 

## Stack

Node.js 24 · TypeScript · Express 5 · PostgreSQL 17 + pgvector · Ollama (`qwen2.5:7b` + `bge-m3`) · tsyringe

## Prerequisites

- PostgreSQL 17 with the `vector` extension available
- A `czech.stop` file in the Postgres `tsearch_data` directory (used by the initial migration)
- [Ollama](https://ollama.com) running locally

```bash
ollama pull qwen2.5:7b
ollama pull bge-m3
```

## Run

```bash
cp .env.example .env          # then set DATABASE_URL
npm install
npm run migrate-db
npm run dev-start
```

To start you need to call the initialize endpoint, which will create vectors in the database:

```bash
curl -X POST http://localhost:3012/initialize

curl -X POST http://localhost:3012/query \
  -H "Content-Type: application/json" \
  -d '{"question":"Pod jakou licencí je katalog publikovaný?"}'
```

## Docker

Brings up Postgres with pgvector, runs the migrations, then starts the API.
Ollama stays on the host.

```bash
docker compose up --build
```

## Endpoints

| Method | Path                | Purpose                                    |
| ------ | ------------------- | ------------------------------------------ |
| GET    | `/status`           | Liveness, no dependencies                  |
| GET    | `/status/readiness` | Readiness, 503 when the database is down   |
| POST   | `/initialize`       | Processes the context file and embed sections |
| POST   | `/query`            | Ask a question                             |

## Scripts

```bash
npm test          # typecheck + unit tests
npm run build     # compile to dist/
npm start         # run the compiled build
npm run format    # prettier
```

## How retrieval works

Both branches query the same table and return their own ranking:

- **Lexical** — `tsvector` with a Czech configuration, ranked by `ts_rank`
- **Semantic** — `bge-m3` embeddings, ranked by cosine distance (`<=>`)

RRF scores each row as `1 / (RRF_K + position + 1)` => reciprocal rank fusion Cormack et al. 2009

## Configuration

Required: `DATABASE_URL`, `OLLAMA_BASE_URL`, `CHAT_MODEL`, `EMBEDDING_MODEL`,
`CHATBOT_CONTEXT_FILE`. Missing ones fail at startup, not on the first request.
