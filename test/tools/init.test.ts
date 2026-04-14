import { describe, it, expect, vi, beforeEach } from "vitest";
import { registerInitTools } from "../../src/tools/init.js";
import * as fs from "node:fs/promises";
import * as brain from "../../src/brain.js";
import { join } from "node:path";

vi.mock("node:fs/promises", () => ({
  readFile: vi.fn(),
  writeFile: vi.fn(),
  mkdir: vi.fn(),
  access: vi.fn(),
  appendFile: vi.fn(),
}));

vi.mock("../../src/brain.js", async (importOriginal) => {
  const actual = await importOriginal() as any;
  return {
    ...actual,
    ensureDir: vi.fn().mockResolvedValue(undefined),
    pathExists: vi.fn().mockResolvedValue(false),
    writeMarkdown: vi.fn().mockResolvedValue(undefined),
  };
});

describe("init tools", () => {
  const brainDir = "/mock/brain";
  let serverMock: any;

  beforeEach(() => {
    vi.clearAllMocks();
    serverMock = {
      registerTool: vi.fn(),
    };
    registerInitTools(serverMock, brainDir, null);
  });

  describe("init_brain", () => {
    it("should register init_brain", () => {
      expect(serverMock.registerTool).toHaveBeenCalledWith("init_brain", expect.anything(), expect.anything());
    });

    it("should create projects and knowledge directories", async () => {
      const handler = serverMock.registerTool.mock.calls.find((c: any) => c[0] === "init_brain")[2];
      await handler({});
      expect(brain.ensureDir).toHaveBeenCalledWith(join(brainDir, "projects"));
      expect(brain.ensureDir).toHaveBeenCalledWith(join(brainDir, "knowledge"));
    });
  });

  describe("init_project", () => {
    it("should create project subdirectories", async () => {
      const handler = serverMock.registerTool.mock.calls.find((c: any) => c[0] === "init_project")[2];
      await handler({ project: "my-proj" });
      const projDir = join(brainDir, "projects", "my-proj");
      expect(brain.ensureDir).toHaveBeenCalledWith(join(projDir, "plans"));
      expect(brain.ensureDir).toHaveBeenCalledWith(join(projDir, "tasks"));
    });
  });

  describe("link_repo", () => {
    it("should create BRAIN.md and agent instructions", async () => {
      const handler = serverMock.registerTool.mock.calls.find((c: any) => c[0] === "link_repo")[2];
      const repoPath = "/mock/repo";
      vi.mocked(fs.readFile).mockResolvedValue(""); 
      await handler({ project: "my-proj", repo_path: repoPath });
      
      expect(fs.writeFile).toHaveBeenCalledWith(join(repoPath, "BRAIN.md"), expect.stringContaining("project: my-proj"), "utf-8");
      expect(fs.writeFile).toHaveBeenCalledWith(join(repoPath, "CLAUDE.md"), expect.stringContaining("BYOBRAIN:START"), "utf-8");
      expect(fs.writeFile).toHaveBeenCalledWith(join(repoPath, "GEMINI.md"), expect.stringContaining("BYOBRAIN:START"), "utf-8");
    });

    it("should update .gitignore with all required entries", async () => {
      const handler = serverMock.registerTool.mock.calls.find((c: any) => c[0] === "link_repo")[2];
      vi.mocked(fs.readFile).mockResolvedValue("node_modules\n");
      await handler({ project: "my-proj", repo_path: "/mock/repo" });
      
      expect(fs.appendFile).toHaveBeenCalledWith(
        join("/mock/repo", ".gitignore"), 
        expect.stringContaining("BRAIN.md"), 
        "utf-8"
      );
      expect(fs.appendFile).toHaveBeenCalledWith(
        join("/mock/repo", ".gitignore"), 
        expect.stringContaining(".agent_state"), 
        "utf-8"
      );
    });
  });
});
