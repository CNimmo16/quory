export interface QuoryRequestHandlerConfig {
  database: {
    type: "postgres" | "mysql" | "sqlite";
    hostOrFilePath: string;
    port?: number | undefined;
    username?: string | undefined;
    password?: string | undefined;
    database?: string | undefined;
  };
}
