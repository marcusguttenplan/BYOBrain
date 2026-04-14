import { describe, it, expect, vi, beforeEach } from "vitest";
import { registerIssueTools } from "../../src/tools/issues.js";
import { registerKnowledgeTools } from "../../src/tools/knowledge.js";
import { registerWalkthroughTools } from "../../src/tools/walkthroughs.js";
import { registerScratchpadTools } from "../../src/tools/scratchpad.js";
import * as brain from "../../src/brain.js";
import { join } from "node:path";

vi.mock("../../src/brain.js", async (importOriginal) => {
  const actual = await importOriginal() as any;
  return {
    ...actual,
    readMarkdown: vi.fn(),
    writeMarkdown: vi.fn(),
    listMarkdownFiles: vi.fn(),
    pathExists: vi.fn().mockResolvedValue(true),
    ensureDir: vi.fn().mockResolvedValue(undefined),
  };
});

describe("other tools (issues, knowledge, walkthroughs, scratchpad)", () => {
  const brainDir = "/mock/brain";
  let serverMock: any;

  beforeEach(() => {
    vi.clearAllMocks();
    serverMock = {
      registerTool: vi.fn(),
      tool: vi.fn(),
    };
    registerIssueTools(serverMock, brainDir, null);
    registerKnowledgeTools(serverMock, brainDir, null);
    registerWalkthroughTools(serverMock, brainDir, null);
    registerScratchpadTools(serverMock, brainDir, null);
  });

  describe("issues", () => {
    it("should create_issue", async () => {
      const handler = serverMock.registerTool.mock.calls.find((c: any) => c[0] === "create_issue")[2];
      const res = await handler({ project: "proj", title: "Bug", body: "Fix it", severity: "high" });
      expect(res.isError).toBeUndefined();
      expect(brain.writeMarkdown).toHaveBeenCalled();
    });

    it("should resolve_issue", async () => {
      const handler = serverMock.registerTool.mock.calls.find((c: any) => c[0] === "resolve_issue")[2];
      vi.mocked(brain.readMarkdown).mockResolvedValue({ data: { status: "open" }, content: "" });
      const res = await handler({ project: "proj", slug: "bug", resolution: "fixed" });
      expect(res.isError).toBeUndefined();
      expect(brain.writeMarkdown).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ status: "resolved" }), expect.anything());
    });
  });

  describe("knowledge", () => {
    it("should save_knowledge", async () => {
      const handler = serverMock.registerTool.mock.calls.find((c: any) => c[0] === "save_knowledge")[2];
      const res = await handler({ title: "KI", summary: "Sum", body: "Content" });
      expect(res.isError).toBeUndefined();
      expect(brain.writeMarkdown).toHaveBeenCalled();
    });
  });

  describe("walkthroughs", () => {
    it("should save_walkthrough", async () => {
      const handler = serverMock.registerTool.mock.calls.find((c: any) => c[0] === "save_walkthrough")[2];
      const res = await handler({ project: "proj", title: "Done", summary: "Sum", body: "Content" });
      expect(res.isError).toBeUndefined();
      expect(brain.writeMarkdown).toHaveBeenCalled();
    });
  });

  describe("scratchpad", () => {
    it("should append_scratchpad", async () => {
      const handler = serverMock.registerTool.mock.calls.find((c: any) => c[0] === "append_scratchpad")[2];
      vi.mocked(brain.readMarkdown).mockResolvedValue({ data: {}, content: "Existing" });
      const res = await handler({ note: "New note" });
      expect(res.isError).toBeUndefined();
      expect(brain.writeMarkdown).toHaveBeenCalled();
    });
  });
});
