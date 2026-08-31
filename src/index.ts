import "reflect-metadata";

import { App } from "./application/App";
import { AppToken } from "./ioc/AppToken";
import { lkodContainer } from "./ioc/Di";

const app = lkodContainer.resolve<App>(AppToken.App);

let isShuttingDown = false;

const shutdown = async (signal: string): Promise<void> => {
  if (isShuttingDown) {
    return;
  }
  isShuttingDown = true;

  try {
    console.info(`Received ${signal}, shutting down.`);
    await app.gracefulShutdown();
    process.exit(0);
  } catch (error) {
    console.error("Error during graceful shutdown", error);
    process.exit(1);
  }
};

process.on("SIGINT", () => void shutdown("SIGINT"));
process.on("SIGTERM", () => void shutdown("SIGTERM"));

process.on("unhandledRejection", (reason) => {
  console.error("Unhandled promise rejection", reason);
  void shutdown("unhandledRejection");
});

app.start().catch((error) => {
  console.error("Failed to start the application", error);
  process.exit(1);
});
