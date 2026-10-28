export interface DatabaseSslConfig {
  mode: "require" | "verify-full";
  /** PEM-encoded certificates and private key, not file paths. */
  ca?: string | undefined;
  cert?: string | undefined;
  key?: string | undefined;
}

export interface QuoryRequestHandlerConfig {
  schemaOptions?:
    | (import("@quory/core").SchemaOptions & {
        minimumRelationshipConfidence?: number | undefined;
      })
    | (() => Promise<
        import("@quory/core").SchemaOptions & {
          minimumRelationshipConfidence?: number | undefined;
        }
      >);
  database: {
    type: "postgres" | "mysql" | "sqlite";
    hostOrFilePath: string;
    port?: number | undefined;
    username?: string | undefined;
    password?: string | undefined;
    database?: string | undefined;
    /** Omit to disable SSL. */
    ssl?: DatabaseSslConfig | undefined;
  };
}
