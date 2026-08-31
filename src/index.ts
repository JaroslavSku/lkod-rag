import { App } from "./application/App";
import { CreateContextController } from "./application/controllers/CreateContextController";
import { QueryController } from "./application/controllers/QueryController";
import { CreateContextService } from "./application/services/CreateContextService";
import { QueryService } from "./application/services/QueryService";
import { OllamaClient } from "./data-access/llama/OllamaClient";
import { PostgresConnector } from "./data-access/PostgresConnector";

const app = new App(
  new QueryController(
    new QueryService(new PostgresConnector(), new OllamaClient()),
  ),
  new PostgresConnector(),
  new CreateContextController(
    new CreateContextService(new PostgresConnector(), new OllamaClient()),
  ),
);

app.start();
