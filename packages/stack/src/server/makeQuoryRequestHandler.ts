import routes from "./routes";
import { QuoryRequestHandlerConfig } from "./types";
import * as ClientDatabaseService from "./services/DatabaseService";
import { z } from "zod";

export default async function makeQuoryRequestHandler(
  config: QuoryRequestHandlerConfig
) {
  const database = await ClientDatabaseService.makeClientDatabase(config);

  return async <P extends keyof typeof routes>(body: {
    path: P;
    data: z.infer<(typeof routes)[P]["validate"]>;
  }) => {
    const parsedBody = z
      .object({
        path: z.string(),
        data: z.unknown(),
      })
      .parse(body);
    const route = routes[parsedBody.path as keyof typeof routes];
    if (!route) {
      throw new Error(`No route found for path ${parsedBody.path}`);
    }
    const response = await route.handle(
      {
        database,
      },
      parsedBody.data
    );
    return response;
  };
}
