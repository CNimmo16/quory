import { router } from "../util/trpc";
import connectionsRouter from "./connectionsRouter";
import queryRouter from "./queryRouter";

const appRouter = router({
  queries: queryRouter,
  connections: connectionsRouter,
});

export default appRouter;
