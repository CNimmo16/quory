export class DatabaseConnectionFailedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DatabaseConnectionFailedError";
  }
}
