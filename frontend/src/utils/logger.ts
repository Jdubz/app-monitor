const mode = import.meta.env.MODE;
const canLogVerbose = mode !== "production" && mode !== "test";

type LogArgs = unknown[];

const prefix = (scope: string) => `[${scope}]`;

export const createLogger = (scope: string) => ({
  debug: (...args: LogArgs) => {
    if (!canLogVerbose) return;
    console.debug(prefix(scope), ...args);
  },
  info: (...args: LogArgs) => {
    if (!canLogVerbose) return;
    console.info(prefix(scope), ...args);
  },
  warn: (...args: LogArgs) => {
    console.warn(prefix(scope), ...args);
  },
  error: (...args: LogArgs) => {
    console.error(prefix(scope), ...args);
  },
});

export const logger = createLogger("app-monitor");
