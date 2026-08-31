import { Router } from "express";
import { inject, injectable } from "tsyringe";
import { AppToken } from "../../ioc/AppToken";
import { CreateContextController } from "../controllers/CreateContextController";
import { QueryController } from "../controllers/QueryController";

@injectable()
export class RagRouter {
  public readonly router: Router;

  constructor(
    @inject(AppToken.QueryController)
    private readonly queryController: QueryController,
    @inject(AppToken.CreateContextController)
    private readonly createContextController: CreateContextController,
  ) {
    this.router = Router();
    this.initRoutes();
  }

  private initRoutes(): void {
    this.router.post("/query", this.queryController.returnQuery);
    this.router.post("/initialize", this.createContextController.createContext);
  }
}
