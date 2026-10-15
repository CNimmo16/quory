import { router } from "../util/trpc";
import connectionsRouter from "./connectionsRouter";
import queryRouter from "./queryRouter";

import projectsRouter from "./projectsRouter";

const appRouter = router({
  projects: projectsRouter,
  queries: queryRouter,
  connections: connectionsRouter,
});

export default appRouter;
