import { describe, it, expect, vi, beforeEach } from "vitest";
import { registerPruneTools } from "../../src/tools/prune.js";
import { registerContextTools } from "../../src/tools/context.js";
import * as brain from "../../src/brain.js";
import * as fs from "node:fs/promises";
import { join } from "node:path";

vi.mock("node:fs/promises", () => ({
  unlink: vi.fn(),
  readFile: vi.fn().mockResolvedValue(""),
  writeFile: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("../../src/brain.js", async (importOriginal) => {
  const actual = await importOriginal() as any;
  return {
    ...actual,
    readMarkdown: vi.fn(),
    writeMarkdown: vi.fn(),
    listMarkdownFiles: vi.fn(),
    pathExists: vi.fn().mockResolvedValue(true),
  };
});

describe("utility tools (prune & context)", () => {
  const brainDir = "/mock/brain";
  let serverMock: any;

  beforeEach(() => {
    vi.clearAllMocks();
    serverMock = {
      registerTool: vi.fn(),
      tool: vi.fn(),
    };
    registerPruneTools(serverMock, brainDir, null);
    registerContextTools(serverMock, brainDir, null);
  });

  describe("prune", () => {
    it("should prune completed plans", async () => {
      vi.mocked(fs.readFile).mockResolvedValue("planning");
      const handler = serverMock.tool.mock.calls.find((c: any) => c[0] === "prune_plans")[3];
      vi.mocked(brain.listMarkdownFiles).mockResolvedValue(["old-plan"]);
      vi.mocked(brain.readMarkdown).mockResolvedValue({ data: { status: "completed" }, content: "" });
      
      const res = await handler({ project: "proj" });
      expect(fs.unlink).toHaveBeenCalledWith(join(brainDir, "projects", "proj", "plans", "old-plan.md"));
      expect(res.content[0].text).toContain("Pruned 1 stale plan(s)");
    });

    it("should prune completed tasks", async () => {
      vi.mocked(fs.readFile).mockResolvedValue("execution");
      const handler = serverMock.tool.mock.calls.find((c: any) => c[0] === "prune_tasks")[3];
      vi.mocked(brain.listMarkdownFiles).mockResolvedValue(["old-task"]);
      vi.mocked(brain.readMarkdown).mockResolvedValue({ data: { status: "completed" }, content: "" });
      
      const res = await handler({ project: "proj" });
      expect(fs.unlink).toHaveBeenCalledWith(join(brainDir, "projects", "proj", "tasks", "old-task.md"));
      expect(res.content[0].text).toContain("Pruned 1 stale task(s)");
    });
  });

  describe("context", () => {
    it("should read_context", async () => {
      const handler = serverMock.registerTool.mock.calls.find((c: any) => c[0] === "read_context")[2];
      vi.mocked(brain.readMarkdown).mockResolvedValue({ content: "Context content", data: { title: "Test" } });
      
      const res = await handler({ project: "proj" });
      expect(res.content[0].text).toContain("title: Test");
      expect(res.content[0].text).toContain("Context content");
    });

    it("should update_context", async () => {
      const handler = serverMock.registerTool.mock.calls.find((c: any) => c[0] === "update_context")[2];
      vi.mocked(brain.readMarkdown).mockResolvedValue({ content: "## Old\nContent", data: {} });
      
      const res = await handler({ project: "proj", updates: "## New\nNew content" });
      expect(res.isError).toBeUndefined();
      expect(brain.writeMarkdown).toHaveBeenCalled();
      expect(res.content[0].text).toContain("Context updated");
    });
  });
});
