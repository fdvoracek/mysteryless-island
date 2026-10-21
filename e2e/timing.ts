import { loadEnv } from "vite";

/** Read the same environment setting as the browser build; tests never hard-code seconds. */
export const STEP_MS = Number(loadEnv("engine-test", process.cwd()).VITE_ACTION_STEP_MS);
if (!Number.isFinite(STEP_MS) || STEP_MS <= 0) throw new Error("VITE_ACTION_STEP_MS must be positive for browser tests");
