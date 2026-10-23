import { router } from "../util/trpc";
import connectionsRouter from "./connectionsRouter";
import queryRouter from "./queryRouter";

import projectsRouter from "./projectsRouter";
import settingsRouter from "./settingsRouter";

const appRouter = router({
  settings: settingsRouter,
  projects: projectsRouter,
  queries: queryRouter,
  connections: connectionsRouter,
});

export default appRouter;
