import { describe, it, expect, vi, beforeEach } from "vitest";
import { registerPlanTools } from "../../src/tools/plans.js";
import { registerTaskTools } from "../../src/tools/tasks.js";
import * as brain from "../../src/brain.js";
import * as state from "../../src/tools/state.js";
import { join } from "node:path";
import * as fs from "node:fs/promises";

// Mocking fs/promises globally for this test
vi.mock("node:fs/promises", () => ({
  mkdir: vi.fn().mockResolvedValue(undefined),
  readFile: vi.fn().mockResolvedValue(""),
  writeFile: vi.fn().mockResolvedValue(undefined),
  access: vi.fn().mockResolvedValue(undefined),
  readdir: vi.fn().mockResolvedValue([]),
}));

vi.mock("../../src/brain.js", async (importOriginal) => {
  const actual = await importOriginal() as any;
  return {
    ...actual,
    readMarkdown: vi.fn(),
    writeMarkdown: vi.fn(),
    pathExists: vi.fn().mockResolvedValue(true),
    ensureDir: vi.fn().mockResolvedValue(undefined),
    listMarkdownFiles: vi.fn(),
    stableSlug: vi.fn().mockImplementation((t) => `stable-${t}`),
    timestampedSlug: vi.fn().mockImplementation((t) => `time-${t}`),
  };
});

vi.mock("../../src/tools/state.js", async (importOriginal) => {
  const actual = await importOriginal() as any;
  return {
    ...actual,
    requireAgentState: vi.fn().mockResolvedValue(undefined),
  };
});

describe("workflow tools (plans & tasks)", () => {
  const brainDir = "/mock/brain";
  let serverMock: any;

  beforeEach(() => {
    vi.clearAllMocks();
    serverMock = {
      registerTool: vi.fn(),
    };
    registerPlanTools(serverMock, brainDir, null);
    registerTaskTools(serverMock, brainDir, null);
  });

  describe("plans", () => {
    it("should list_plans", async () => {
      const handler = serverMock.registerTool.mock.calls.find((c: any) => c[0] === "list_plans")[2];
      vi.mocked(brain.listMarkdownFiles).mockResolvedValue(["plan-a", "plan-b"]);
      vi.mocked(brain.readMarkdown).mockResolvedValue({ data: { title: "Title", summary: "Sum" }, content: "" });
      
      const res = await handler({ project: "proj" });
      expect(res.content[0].text).toContain("plan-a");
      expect(res.content[0].text).toContain("plan-b");
    });

    it("should get_plan", async () => {
      const handler = serverMock.registerTool.mock.calls.find((c: any) => c[0] === "get_plan")[2];
      vi.mocked(brain.readMarkdown).mockResolvedValue({ data: { title: "My Plan" }, content: "The content" });
      
      const res = await handler({ project: "proj", slug: "my-plan" });
      expect(res.content[0].text).toContain("The content");
    });

    it("should allow save_plan if it has a verification plan", async () => {
      const handler = serverMock.registerTool.mock.calls.find((c: any) => c[0] === "save_plan")[2];
      const body = "## Proposed Changes\n...\n## Verification Plan\nTests.";
      const res = await handler({ project: "proj", title: "My Plan", body, summary: "Sum" });
      expect(res.isError).toBeUndefined();
      expect(brain.writeMarkdown).toHaveBeenCalled();
    });

    it("should reject save_plan if verification plan is missing", async () => {
      const handler = serverMock.registerTool.mock.calls.find((c: any) => c[0] === "save_plan")[2];
      const body = "## Proposed Changes\nNo verification here.";
      await expect(handler({ project: "proj", title: "My Plan", body, summary: "Sum" }))
        .rejects.toThrow(/Verification Plan/);
    });
  });

  describe("tasks", () => {
    it("should list_tasks", async () => {
      const handler = serverMock.registerTool.mock.calls.find((c: any) => c[0] === "list_tasks")[2];
      vi.mocked(brain.listMarkdownFiles).mockResolvedValue(["task-1"]);
      vi.mocked(brain.readMarkdown).mockResolvedValue({ data: { title: "T1", summary: "S1" }, content: "" });
      const res = await handler({ project: "proj" });
      expect(res.content[0].text).toContain("task-1");
    });

    it("should get_task", async () => {
      const handler = serverMock.registerTool.mock.calls.find((c: any) => c[0] === "get_task")[2];
      vi.mocked(brain.readMarkdown).mockResolvedValue({ data: { title: "T1" }, content: "- [ ] Run" });
      const res = await handler({ project: "proj", slug: "t1" });
      expect(res.content[0].text).toContain("- [ ] Run");
    });

    it("should allow save_task", async () => {
      const handler = serverMock.registerTool.mock.calls.find((c: any) => c[0] === "save_task")[2];
      vi.mocked(brain.readMarkdown).mockResolvedValue({ data: {}, content: "" });
      const res = await handler({ project: "proj", title: "My Task", body: "- [ ] Task" });
      expect(res.isError).toBeUndefined();
      expect(brain.writeMarkdown).toHaveBeenCalled();
    });
  });
});
