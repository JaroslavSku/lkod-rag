import { container, instanceCachingFactory } from "tsyringe";
import { App } from "../application/App";
import { CreateContextController } from "../application/controllers/CreateContextController";
import { QueryController } from "../application/controllers/QueryController";
import { RagRouter } from "../application/routers/RagRouter";
import { StatusRouter } from "../application/routers/StatusRouter";
import { CreateContextService } from "../application/services/CreateContextService";
import { QueryService } from "../application/services/QueryService";
import type { IAppConfig } from "../config/AppConfig";
import { loadAppConfig } from "../config/AppConfig";
import { OllamaClient } from "../data-access/llama/OllamaClient";
import { PostgresConnector } from "../data-access/PostgresConnector";
import type { ILogger } from "../utils/Logger";
import { createLogger } from "../utils/Logger";
import { AppToken } from "./AppToken";

const lkodContainer = container.createChildContainer();

lkodContainer.registerInstance<IAppConfig>(AppToken.AppConfig, loadAppConfig());

lkodContainer.register<ILogger>(AppToken.Logger, {
  useFactory: instanceCachingFactory<ILogger>((dependencyContainer) =>
    createLogger(dependencyContainer.resolve<IAppConfig>(AppToken.AppConfig)),
  ),
});

lkodContainer.registerSingleton(AppToken.PostgresConnector, PostgresConnector);
lkodContainer.registerSingleton(AppToken.OllamaClient, OllamaClient);

lkodContainer.registerSingleton(AppToken.QueryService, QueryService);
lkodContainer.registerSingleton(
  AppToken.CreateContextService,
  CreateContextService,
);

lkodContainer.registerSingleton(AppToken.QueryController, QueryController);
lkodContainer.registerSingleton(
  AppToken.CreateContextController,
  CreateContextController,
);

lkodContainer.registerSingleton(AppToken.Router, RagRouter);
lkodContainer.registerSingleton(AppToken.StatusRouter, StatusRouter);

lkodContainer.registerSingleton(AppToken.App, App);

export { lkodContainer };
