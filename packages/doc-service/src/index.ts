export { DocumentService, type DocumentServiceOptions } from "./service";
export { History, type HistoryEntry } from "./history";
export {
  hashText,
  listDesignFiles,
  MANIFEST_NAME,
  readManifest,
  resolveInside,
  toPosix,
  writeFileAtomic,
} from "./paths";
export {
  currentVersions,
  loadProject,
  planCommands,
  rebuildIndex,
  reanchor,
  reanchorCommand,
  toTextRecord,
  type FileState,
  type PlanOutcome,
  type ProjectSnapshot,
} from "./project";
export {
  createBundle,
  extractBundle,
  type BundleManifest,
  type BundlePayload,
} from "./bundle";
