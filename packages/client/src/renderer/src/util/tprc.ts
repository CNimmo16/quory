import { createTRPCReact } from "@trpc/react-query";
import type { AppRouter } from "../../../main/ipc";

const trpc = createTRPCReact<AppRouter>();

export default trpc;
