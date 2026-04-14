import { describe, it, expect, vi } from "vitest";
import { 
  enforceProjectScope, 
  slugify, 
  timestampedSlug, 
  stableSlug,
  parseMatter,
  stringifyMatter,
  mergeContextSections,
  parseBrainMd,
  resolveBrainDirAsync,
  listMarkdownFiles,
  findByTitle
} from "../src/brain.js";
import * as fs from "node:fs/promises";
import { join } from "node:path";

vi.mock("node:fs/promises", () => ({
  readFile: vi.fn(),
  access: vi.fn().mockResolvedValue(undefined),
  readdir: vi.fn(),
}));

describe("brain logic checks", () => {
  describe("enforceProjectScope", () => {
    it("should allow any project if lockedProject is null", () => {
      const result = enforceProjectScope("test-project", null);
      expect(result).toBeNull();
    });

    it("should allow matching project when server is locked", () => {
      const result = enforceProjectScope("test-project", "test-project");
      expect(result).toBeNull();
    });

    it("should throw an MCP error object when requested project does not match lock", () => {
      const result = enforceProjectScope("wrong-project", "locked-project");
      
      expect(result).not.toBeNull();
      expect(result).toEqual({
        content: [
          {
            type: "text",
            text: "Security Violation: MCP server is locked to project 'locked-project'. Cannot access project 'wrong-project'.",
          },
        ],
        isError: true,
      });
    });
  });

  describe("slug generation", () => {
    it("should slugify titles correctly", () => {
      expect(slugify("Hello World!")).toBe("hello-world");
      expect(slugify("---Complex (Title)---")).toBe("complex-title");
      expect(slugify("  Spaces  ")).toBe("spaces");
    });

    it("should generate timestamped slugs", () => {
      const slug = timestampedSlug("my-task");
      expect(slug).toMatch(/^\d{4}-\d{2}-\d{2}/);
      expect(slug).toContain("my-task");
    });

    it("should generate stable slugs (date-hour only)", () => {
      const slug = stableSlug("fixed-plan");
      expect(slug).toMatch(/^\d{4}-\d{2}-\d{2}/);
      expect(slug).toContain("fixed-plan");
    });
  });

  describe("markdown frontmatter", () => {
    it("should parse frontmatter and content correctly", () => {
      const raw = "---\ntitle: Test\n---\nBody text here";
      const parsed = parseMatter(raw);
      expect(parsed.data.title).toBe("Test");
      expect(parsed.content.trim()).toBe("Body text here");
    });

    it("should handle missing frontmatter gracefully", () => {
      const raw = "Just plain text";
      const parsed = parseMatter(raw);
      expect(parsed.data).toEqual({});
      expect(parsed.content).toBe(raw);
    });

    it("should stringify frontmatter correctly", () => {
      const content = "Body text";
      const data = { title: "Title", tags: ["a", "b"] };
      const res = stringifyMatter(content, data);
      expect(res).toContain("title: Title");
      expect(res).toContain("tags:");
      expect(res).toContain("Body text");
    });

    it("should return raw content if data is empty", () => {
      const content = "Just content";
      expect(stringifyMatter(content, {})).toBe(content);
    });
  });

  describe("context merging", () => {
    const existing = "# Project Context\n\n## State\nActive.\n\n## Decisions\nNone.";
    
    it("should replace matching sections", () => {
      const updates = "## State\nCompleted.";
      const merged = mergeContextSections(existing, updates);
      expect(merged).toContain("## State\nCompleted.");
      expect(merged).toContain("## Decisions\nNone.");
    });

    it("should append new sections", () => {
      const updates = "## Roadmap\nFuture steps.";
      const merged = mergeContextSections(existing, updates);
      expect(merged).toContain("## Roadmap\nFuture steps.");
      expect(merged).toContain("## State\nActive.");
    });
  });

  describe("directory discovery", () => {
    it("should parse brain.md config", async () => {
      vi.mocked(fs.readFile).mockResolvedValue("brain_dir: /path/to/brain\nproject: my-proj");
      const config = await parseBrainMd("BRAIN.md");
      expect(config?.brain_dir).toBe("/path/to/brain");
      expect(config?.project).toBe("my-proj");
    });

    it("should handle missing brain.md", async () => {
      vi.mocked(fs.readFile).mockRejectedValue(new Error("File not found"));
      const config = await parseBrainMd("BRAIN.md");
      expect(config).toBeNull();
    });

    it("should throw on invalid brain.md fields", async () => {
      vi.mocked(fs.readFile).mockResolvedValue("unknown_field: xyz");
      await expect(parseBrainMd("BRAIN.md")).rejects.toThrow(/Invalid BRAIN.md/);
    });

    it("should resolve brain dir from env if provided", async () => {
      vi.mocked(fs.readFile).mockResolvedValue("brain_dir: /env/dir\nproject: env-proj");
      const dir = await resolveBrainDirAsync("/env/dir");
      expect(dir).toBe("/env/dir");
    });
  });

  describe("file list and search", () => {
    it("should list markdown slugs", async () => {
      vi.mocked(fs.readdir).mockResolvedValue(["a.md", "b.txt", "c.MD"] as any);
      const slugs = await listMarkdownFiles("/dir");
      expect(slugs).toEqual(["a", "c"]);
    });

    it("should return empty if readdir fails with ENOENT", async () => {
      const err = new Error("Not found") as any;
      err.code = "ENOENT";
      vi.mocked(fs.readdir).mockRejectedValue(err);
      const slugs = await listMarkdownFiles("/dir");
      expect(slugs).toEqual([]);
    });

    it("should find by title", async () => {
      vi.mocked(fs.readdir).mockResolvedValue(["file.md"] as any);
      vi.mocked(fs.readFile).mockResolvedValue("---\ntitle: Match\n---\nHello");
      const slug = await findByTitle("/dir", "Match");
      expect(slug).toBe("file");
    });

    it("should return null if no title match", async () => {
      vi.mocked(fs.readdir).mockResolvedValue(["file.md"] as any);
      vi.mocked(fs.readFile).mockResolvedValue("---\ntitle: No match\n---\nHello");
      const slug = await findByTitle("/dir", "Match");
      expect(slug).toBeNull();
    });
  });
});
