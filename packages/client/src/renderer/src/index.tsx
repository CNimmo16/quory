import { initializeTelemetry, captureRendererException } from "./telemetry";
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
initializeTelemetry();
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

// Render the app
const rootElement = document.getElementById("root")!;
if (!rootElement.innerHTML) {
  const root = ReactDOM.createRoot(rootElement);
  root.render(
    <StrictMode>
      <GlobalProviders>
        <RouterProvider router={router} />
      </GlobalProviders>
    </StrictMode>,
  );
}
