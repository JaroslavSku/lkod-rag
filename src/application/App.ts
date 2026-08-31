import express, { Express } from "express";
import { Router } from "express";
import { QueryController } from "./controllers/QueryController";
import bodyParser from "body-parser";
import { PostgresConnector } from "../data-access/PostgresConnector";
import { CreateContextController } from "./controllers/CreateContextController";
export class App {
  private readonly express: Express;

  constructor(
    private queryController: QueryController,
    private postgresConnector: PostgresConnector,
    private createContextController: CreateContextController,
  ) {
    this.express = express();
  }

  public start() {
    this.postgresConnector.connect();
    this.express.use(bodyParser.json());
    this.initRoutes();
    this.express.listen(3012, () => {
      console.log("listening to 3012");
    });
  }

  public initRoutes() {
    this.express.post("/query", this.queryController.returnQuery);
    this.express.get("/initialize", this.createContextController.createContext);
  }
}
