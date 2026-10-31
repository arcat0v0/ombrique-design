import { execFile } from "node:child_process";
import { isAbsolute, normalize, relative } from "node:path";
import type { GitBranchList, GitCommit, GitStatus } from "@ombrique/protocol";

const DESIGN_EXTENSIONS = [".tsx", ".scss", ".css", ".json", ".svg"];

export function execGit(
  args: string[],
  cwd: string,
): Promise<{ stdout: string; stderr: string }> {
  const {
    promise,
    resolve: resolvePromise,
    reject: rejectPromise,
  } = Promise.withResolvers<{ stdout: string; stderr: string }>();
  execFile(
    "git",
    args,
    {
      cwd,
      maxBuffer: 64 * 1024 * 1024,
      env: { ...process.env, GIT_TERMINAL_PROMPT: "0" },
    },
    (error, stdout, stderr) => {
      if (error) {
        const msg = stderr.trim() || stdout.trim() || error.message;
        rejectPromise(new Error(msg));
        return;
      }
      resolvePromise({ stdout, stderr });
    },
  );
  return promise;
}

export async function isGitRepo(cwd: string): Promise<boolean> {
  try {
    const { stdout } = await execGit(
      ["rev-parse", "--is-inside-work-tree"],
      cwd,
    );
    return stdout.trim() === "true";
  } catch {
    return false;
  }
}

export async function getRepoRoot(cwd: string): Promise<string> {
  const { stdout } = await execGit(["rev-parse", "--show-toplevel"], cwd);
  return stdout.trim();
}

export async function getCurrentBranch(
  projectRoot: string,
): Promise<string | null> {
  try {
    const { stdout } = await execGit(["branch", "--show-current"], projectRoot);
    const branch = stdout.trim();
    if (branch.length > 0) return branch;
    const { stdout: revStdout } = await execGit(
      ["rev-parse", "--short", "HEAD"],
      projectRoot,
    );
    const short = revStdout.trim();
    return short.length > 0 ? short : null;
  } catch {
    return null;
  }
}

export async function listBranches(
  projectRoot: string,
): Promise<GitBranchList> {
  const isRepo = await isGitRepo(projectRoot);
  if (!isRepo) {
    return { current: null, branches: [] };
  }
  const current = await getCurrentBranch(projectRoot);
  try {
    const { stdout } = await execGit(
      ["branch", "--list", "--format=%(refname:short)"],
      projectRoot,
    );
    const branches = stdout
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => line.length > 0);
    return { current, branches };
  } catch {
    return { current, branches: current ? [current] : [] };
  }
}

function isDesignPath(relPath: string): boolean {
  const norm = normalize(relPath).replace(/\\/g, "/");
  if (norm.startsWith("../") || norm === "..") return false;
  if (norm.startsWith(".git/") || norm.startsWith(".git")) return false;
  if (norm.includes("/node_modules/") || norm.startsWith("node_modules/"))
    return false;
  if (norm.includes("/.ombrique-tmp") || norm.startsWith(".ombrique-tmp"))
    return false;
  return DESIGN_EXTENSIONS.some((ext) => norm.endsWith(ext));
}

export async function getGitStatus(projectRoot: string): Promise<GitStatus> {
  const isRepo = await isGitRepo(projectRoot);
  if (!isRepo) {
    return {
      isRepo: false,
      currentBranch: null,
      dirty: false,
      changedFiles: [],
    };
  }
  const currentBranch = await getCurrentBranch(projectRoot);
  try {
    const { stdout } = await execGit(
      ["status", "--porcelain=v1", "-uall", "--", "."],
      projectRoot,
    );
    const lines = stdout.split("\n").filter((l) => l.trim().length > 0);
    const changedFiles: string[] = [];
    for (const line of lines) {
      const pathPart = line.slice(3).trim();
      const actualPath = pathPart.includes(" -> ")
        ? (pathPart.split(" -> ")[1]?.trim() ?? pathPart)
        : pathPart;
      const cleanPath = actualPath.replace(/^"|"$/g, "");
      if (isDesignPath(cleanPath)) {
        changedFiles.push(cleanPath);
      }
    }
    return {
      isRepo: true,
      currentBranch,
      dirty: changedFiles.length > 0,
      changedFiles,
    };
  } catch {
    return {
      isRepo: true,
      currentBranch,
      dirty: false,
      changedFiles: [],
    };
  }
}

export async function createBranch(
  projectRoot: string,
  branchName: string,
): Promise<void> {
  const trimmed = branchName.trim();
  if (
    !trimmed ||
    trimmed.startsWith("-") ||
    trimmed.startsWith(".") ||
    trimmed.includes("..") ||
    trimmed.includes(" ") ||
    trimmed.includes("~") ||
    trimmed.includes("^") ||
    trimmed.includes(":")
  ) {
    throw new Error(`无效的分支名称: "${branchName}"`);
  }
  const status = await getGitStatus(projectRoot);
  if (status.dirty) {
    throw new Error("工作区有未提交的设计修改，请先保存版本后再创建并切换分支");
  }
  await execGit(["checkout", "-b", trimmed], projectRoot);
}

export async function switchBranch(
  projectRoot: string,
  branchName: string,
): Promise<void> {
  const trimmed = branchName.trim();
  if (!trimmed || trimmed.startsWith("-")) {
    throw new Error(`无效的分支名称: "${branchName}"`);
  }
  const status = await getGitStatus(projectRoot);
  if (status.dirty) {
    throw new Error("工作区有未提交的设计修改，请先保存版本后再切换分支");
  }
  await execGit(["switch", trimmed], projectRoot);
}

export async function listHistory(
  projectRoot: string,
  limit = 100,
): Promise<GitCommit[]> {
  const isRepo = await isGitRepo(projectRoot);
  if (!isRepo) return [];
  try {
    await execGit(["rev-parse", "--verify", "HEAD"], projectRoot);
  } catch {
    return [];
  }
  try {
    const { stdout } = await execGit(
      [
        "log",
        `-n${limit}`,
        "--format=%x1e%H%x1f%h%x1f%an%x1f%ae%x1f%aI%x1f%s",
        "--name-only",
        "--relative",
        ".",
      ],
      projectRoot,
    );
    const records = stdout
      .split("\x1e")
      .filter((chunk) => chunk.trim().length > 0);
    const commits: GitCommit[] = [];
    for (const record of records) {
      const [headerLine, ...fileLines] = record.split("\n");
      if (!headerLine) continue;
      const parts = headerLine.split("\x1f");
      if (parts.length < 6) continue;
      const [hash, shortHash, author, email, date, ...rest] = parts;
      const message = rest.join("\x1f").trim();
      const rawFiles = fileLines
        .map((f) => f.trim().replace(/^"|"$/g, ""))
        .filter((f) => f.length > 0 && isDesignPath(f));
      const changedPages = rawFiles
        .filter((f) => f.startsWith("pages/") && f.endsWith(".tsx"))
        .map((f) => f.replace(/^pages\//, "").replace(/\.tsx$/, ""));
      commits.push({
        hash: hash ?? "",
        shortHash: shortHash ?? "",
        author: author ?? "",
        email: email ?? "",
        date: date ?? "",
        message,
        changedPages,
        changedFiles: rawFiles,
      });
    }
    return commits;
  } catch {
    return [];
  }
}

export async function saveVersion(
  projectRoot: string,
  message: string,
): Promise<{ hash: string; message: string }> {
  const trimmed = message.trim();
  if (!trimmed) {
    throw new Error("版本描述不能为空");
  }
  const status = await getGitStatus(projectRoot);
  if (!status.isRepo) {
    throw new Error("当前目录不是 Git 仓库");
  }
  if (!status.dirty || status.changedFiles.length === 0) {
    throw new Error("没有需要保存的设计变更");
  }

  const filesToAdd = status.changedFiles;
  await execGit(["add", "--", ...filesToAdd], projectRoot);
  await execGit(["commit", "-m", trimmed], projectRoot);

  const { stdout: hashStdout } = await execGit(
    ["rev-parse", "HEAD"],
    projectRoot,
  );
  return {
    hash: hashStdout.trim(),
    message: trimmed,
  };
}

export async function readPastVersion(
  projectRoot: string,
  rev: string,
  relPath: string,
): Promise<string> {
  const norm = normalize(relPath).replace(/\\/g, "/");
  if (norm.startsWith("../") || isAbsolute(norm)) {
    throw new Error(`非法路径: ${relPath}`);
  }
  const repoRoot = await getRepoRoot(projectRoot);
  const projectRel = relative(repoRoot, projectRoot).replace(/\\/g, "/");
  const fullRel = projectRel.length > 0 ? `${projectRel}/${norm}` : norm;
  const { stdout } = await execGit(["show", `${rev}:${fullRel}`], repoRoot);
  return stdout;
}

export async function readPastVersionFiles(
  projectRoot: string,
  rev: string,
): Promise<Record<string, string>> {
  const repoRoot = await getRepoRoot(projectRoot);
  const projectRel = relative(repoRoot, projectRoot).replace(/\\/g, "/");
  const lsArgs = ["ls-tree", "-r", "--name-only", rev];
  if (projectRel.length > 0) {
    lsArgs.push("--", projectRel);
  }
  const { stdout } = await execGit(lsArgs, repoRoot);
  const lines = stdout
    .split("\n")
    .map((l) => l.trim().replace(/^"|"$/g, ""))
    .filter((l) => l.length > 0);

  const result: Record<string, string> = {};
  for (const line of lines) {
    const relToProject =
      projectRel.length > 0 && line.startsWith(`${projectRel}/`)
        ? line.slice(projectRel.length + 1)
        : line;
    if (relToProject === "comments.json") continue;
    if (!isDesignPath(relToProject)) continue;
    try {
      const { stdout: fileContent } = await execGit(
        ["show", `${rev}:${line}`],
        repoRoot,
      );
      result[relToProject] = fileContent;
    } catch {}
  }
  return result;
}
