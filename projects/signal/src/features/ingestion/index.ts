export { runIngest } from "./lib/run-ingest";
export { parseFeedXml } from "./lib/parse-feed";
export type { RawFeedItem } from "./lib/parse-feed";
export type {
  IngestPorts,
  IngestReport,
  SourceReport,
  SummaryCandidate,
} from "./lib/ports";
export { createIngestPorts } from "./api/ports";
