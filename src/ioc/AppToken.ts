const AppToken = {
  App: Symbol("App"),

  AppConfig: Symbol("AppConfig"),
  Logger: Symbol("Logger"),
  PostgresConnector: Symbol("PostgresConnector"),
  OllamaClient: Symbol("OllamaClient"),

  QueryService: Symbol("QueryService"),
  CreateContextService: Symbol("CreateContextService"),

  QueryController: Symbol("QueryController"),
  CreateContextController: Symbol("CreateContextController"),

  Router: Symbol("Router"),
  StatusRouter: Symbol("StatusRouter"),
};

export { AppToken };
