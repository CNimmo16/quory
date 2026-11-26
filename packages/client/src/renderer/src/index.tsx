import { captureRendererException } from "./telemetry";
import { StrictMode } from "react";
import ReactDOM from "react-dom/client";
import {
  RouterProvider,
  createHashHistory,
  createRouter,
} from "@tanstack/react-router";
import "./index.css";

// Import the generated route tree
import { routeTree } from "./routeTree.gen";
import GlobalProviders from "./GlobalProviders";

// Create a new router instance
const router = createRouter({
  routeTree,
  history: createHashHistory(),
  defaultOnCatch: captureRendererException,
});

// Register the router instance for type safety
declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}

// Reuse the root if this entry module is evaluated again during HMR, but always
// render the current providers and router rather than leaving the old tree up.
const rootElement = document.getElementById("root")!;
const root: ReactDOM.Root =
  import.meta.hot?.data.root ?? ReactDOM.createRoot(rootElement);
if (import.meta.hot) import.meta.hot.data.root = root;
root.render(
  <StrictMode>
    <GlobalProviders>
      <RouterProvider router={router} />
    </GlobalProviders>
  </StrictMode>,
);
