export {
  handleEditCommandSchema,
  type HandleEditCommand,
  type HandleRef,
} from "./commands";
export {
  AgentSocketClient,
  type AgentClientState,
  type AgentSocketClientOptions,
} from "./client";
export { DIALECT_DOC } from "./dialect";
export { ToolError } from "./errors";
export {
  HandleLimitError,
  HandleRegistry,
  type HandleRecord,
} from "./handles";
export { createMcpServer } from "./server";
export {
  DocumentTools,
  type DocumentToolsOptions,
  type ReadNodeResult,
  type ReadStateResult,
  type ReadTreeResult,
  type StatePage,
  type TreeNode,
  type TreeRect,
} from "./tools";
export {
  defaultUserDataDir,
  resolveSocketPath,
  socketPathFor,
  type ResolveSocketPathOptions,
} from "./user-data";
