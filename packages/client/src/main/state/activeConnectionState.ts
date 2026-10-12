import { connectionRepo } from "./connectionRepo";
import { connectQuorySession, quorySessions } from "./quorySession";

const activeConnectionState = {
  async getActiveConnectionId() {
    return quorySessions.connectionId ?? null;
  },
  async getActiveConnectionIdOrThrow() {
    const id = quorySessions.connectionId;
    if (!id) throw new Error("No active connection");
    return id;
  },
  async getActiveConnection() {
    const id = quorySessions.connectionId;
    if (!id) return null;
    try {
      return await connectionRepo.get(id);
    } catch {
      await quorySessions.disconnect(id);
      return null;
    }
  },
  async setActiveConnection(connectionId: string) {
    await connectQuorySession(connectionId);
  },
  async deleteActiveConnection(connectionId?: string) {
    await quorySessions.disconnect(connectionId);
  },
};

export default activeConnectionState;
