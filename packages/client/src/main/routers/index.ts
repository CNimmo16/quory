import { router } from "../util/trpc";
import connectionsRouter from "./connectionsRouter";
import queryRouter from "./queryRouter";

import projectsRouter from "./projectsRouter";
import settingsRouter from "./settingsRouter";
import joinRankingRouter from "./joinRankingRouter";

const appRouter = router({
  settings: settingsRouter,
  joinRanking: joinRankingRouter,
  projects: projectsRouter,
  queries: queryRouter,
  connections: connectionsRouter,
});

export default appRouter;
