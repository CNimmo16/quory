import { connectionRepo } from "../routers/connectionsRouter";

let activeConnectionId: string | null = null;
let connectionGeneration = 0;

const activeConnectionState = {
  getConnectionGeneration() {
    return connectionGeneration;
  },
  async getActiveConnectionId() {
    return activeConnectionId;
  },
  async getActiveConnectionIdOrThrow() {
    if (!activeConnectionId) {
      throw new Error("No active connection");
    }
    return activeConnectionId;
  },
  async getActiveConnection() {
    if (!activeConnectionId) return null;
    try {
      const connection = await connectionRepo.get(activeConnectionId);
      return connection;
    } catch {
      // if connection has disappeared remove it from active state
      await this.deleteActiveConnection();
      return null;
    }
  },
  async setActiveConnection(connectionId: string) {
    connectionGeneration++;
    activeConnectionId = connectionId;
  },
  async deleteActiveConnection() {
    connectionGeneration++;
    activeConnectionId = null;
  },
};

export default activeConnectionState;
