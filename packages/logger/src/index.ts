import { Axiom } from "@axiomhq/js";
import pino from "pino";

import { redactSensitive } from "./redact";

const isDev = process.env.NODE_ENV !== "production";
const isCloud = process.env.NEXT_PUBLIC_KAN_ENV === "cloud";
const level = process.env.LOG_LEVEL || (isDev ? "debug" : "info");

const axiomToken = process.env.AXIOM_TOKEN;
const axiomDataset = process.env.AXIOM_DATASET;
const useAxiom = isCloud && !!axiomToken && !!axiomDataset;

function createAxiomStream(token: string, dataset: string): pino.DestinationStream {
  const client = new Axiom({ token });
  return {
    write(msg: string) {
      try {
        client.ingest(dataset, [JSON.parse(msg) as Record<string, unknown>]);
      } catch {
        // ignore malformed log lines
      }
    },
  };
}

// Runs on every log line, including child loggers, so secrets are masked no
// matter which module logs them or how deeply they are nested.
const formatters = {
  log: (obj: Record<string, unknown>) =>
    redactSensitive(obj) as Record<string, unknown>,
};

export const logger = useAxiom
  ? pino(
      { level, formatters },
      pino.multistream([
        { stream: process.stdout, level },
        { stream: createAxiomStream(axiomToken, axiomDataset), level },
      ]),
    )
  : pino({
      level,
      formatters,
      ...(isDev && {
        transport: {
          target: "pino-pretty",
          options: { colorize: true, ignore: "pid,hostname", translateTime: "HH:MM:ss" },
        },
      }),
    });

export const createLogger = (module: string) => logger.child({ module });
