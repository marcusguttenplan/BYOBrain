import { readFile, writeFile, readdir, mkdir, access } from "node:fs/promises";
import { join, basename } from "node:path";
import { parse as yamlParse, stringify as yamlStringify } from "yaml";
import { z } from "zod";

// ---------------------------------------------------------------------------
// BRAIN.md schema — strongly typed configuration
// ---------------------------------------------------------------------------

/** Zod schema for BRAIN.md frontmatter/fields. */
export const BrainMdSchema = z.object({
  brain_dir: z
    .string()
    .min(1, "brain_dir must be a non-empty absolute path"),
  project: z
    .string()
    .min(1, "project must be a non-empty string")
    .regex(/^[a-z0-9_-]+$/i, "project must be alphanumeric with hyphens/underscores"),
});

/** Strongly-typed BRAIN.md configuration. */
export type BrainMdConfig = z.infer<typeof BrainMdSchema>;

// ---------------------------------------------------------------------------
// Directory helpers
// ---------------------------------------------------------------------------

/**
 * Resolve the brain directory path.
 * Priority: BRAIN_DIR env var → BRAIN.md in cwd → error.
 */
export function resolveBrainDir(cwd?: string): string {
  const fromEnv = process.env.BRAIN_DIR;
  if (fromEnv) return fromEnv;

  // Fallback: try to read BRAIN.md from cwd
  // This is resolved lazily at call-time so we don't block startup
  throw new Error(
    "BRAIN_DIR environment variable is not set and no BRAIN.md found. " +
      "Set BRAIN_DIR or place a BRAIN.md in the working directory."
  );
}

/**
 * Parse and validate a BRAIN.md file.
 * Returns the strongly-typed config if valid, null if file not found.
 * Throws on validation errors (malformed BRAIN.md).
 */
export async function parseBrainMd(
  brainMdPath: string
): Promise<BrainMdConfig | null> {
  let raw: string;
  try {
    raw = await readFile(brainMdPath, "utf-8");
  } catch {
    return null; // File doesn't exist
  }

  // BRAIN.md can be either YAML frontmatter or plain key: value lines
  // Try frontmatter first, fall back to line-by-line parsing
  let fields: Record<string, unknown>;

  const parsed = parseMatter(raw);
  if (Object.keys(parsed.data).length > 0) {
    fields = parsed.data;
  } else {
    // Parse as plain key: value lines (no frontmatter delimiters)
    fields = {};
    for (const line of raw.split("\n")) {
      const match = line.match(/^(\w+):\s*(.+)$/);
      if (match) {
        fields[match[1]] = match[2].trim();
      }
    }
  }

  const result = BrainMdSchema.safeParse(fields);
  if (!result.success) {
    const issues = result.error.issues
      .map((i) => `  ${i.path.join(".")}: ${i.message}`)
      .join("\n");
    throw new Error(`Invalid BRAIN.md at ${brainMdPath}:\n${issues}`);
  }

  return result.data;
}

/**
 * Try to resolve brain_dir from a BRAIN.md file at the given path.
 * Returns the brain_dir value if found, null otherwise.
 */
export async function resolveBrainDirFromFile(
  brainMdPath: string
): Promise<string | null> {
  const config = await parseBrainMd(brainMdPath);
  return config?.brain_dir ?? null;
}

/**
 * Resolve the brain directory, checking env first, then BRAIN.md file.
 */
export async function resolveBrainDirAsync(cwd?: string): Promise<string> {
  const fromEnv = process.env.BRAIN_DIR;
  if (fromEnv) return fromEnv;

  const workDir = cwd || process.cwd();
  const brainMdPath = join(workDir, "BRAIN.md");
  const fromFile = await resolveBrainDirFromFile(brainMdPath);
  if (fromFile) return fromFile;

  throw new Error(
    "BRAIN_DIR environment variable is not set and no BRAIN.md found in " +
      workDir +
      ". Set BRAIN_DIR or place a BRAIN.md in the working directory."
  );
}

/** Ensure a directory exists (recursive). */
export async function ensureDir(dirPath: string): Promise<void> {
  await mkdir(dirPath, { recursive: true });
}

/** Check if a path exists. */
export async function pathExists(filePath: string): Promise<boolean> {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------
// Markdown / frontmatter helpers
// ---------------------------------------------------------------------------

export interface MarkdownFile {
  data: Record<string, unknown>;
  content: string;
}

const FRONTMATTER_REGEX = /^\s*---\r?\n([\s\S]*?)\r?\n---\r?\n([\s\S]*)$/;

export function parseMatter(raw: string): MarkdownFile {
  const match = raw.match(FRONTMATTER_REGEX);
  if (match) {
    try {
      const data = yamlParse(match[1]);
      return { data: typeof data === "object" && data !== null ? data : {}, content: match[2] };
    } catch {
      return { data: {}, content: raw };
    }
  }
  return { data: {}, content: raw };
}

export function stringifyMatter(content: string, data: Record<string, unknown>): string {
  if (!data || Object.keys(data).length === 0) return content;
  const yamlString = yamlStringify(data).trim();
  return `---\n${yamlString}\n---\n${content}`;
}

/** Read a markdown file and parse its YAML frontmatter. */
export async function readMarkdown(filePath: string): Promise<MarkdownFile> {
  const raw = await readFile(filePath, "utf-8");
  return parseMatter(raw);
}

/** Write a markdown file with YAML frontmatter. */
export async function writeMarkdown(
  filePath: string,
  data: Record<string, unknown>,
  content: string
): Promise<void> {
  const output = stringifyMatter(content, data);
  await writeFile(filePath, output, "utf-8");
}

/** List all .md files in a directory. Returns basenames without extension. */
export async function listMarkdownFiles(dirPath: string): Promise<string[]> {
  try {
    const entries = await readdir(dirPath);
    return entries
      .filter((f) => f.endsWith(".md"))
      .map((f) => f.replace(/\.md$/, ""));
  } catch {
    return [];
  }
}

// ---------------------------------------------------------------------------
// Slug generation
// ---------------------------------------------------------------------------

/** Generate a URL-safe slug from a title string. */
export function slugify(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .substring(0, 80);
}

// ---------------------------------------------------------------------------
// Section-level context merging
// ---------------------------------------------------------------------------

interface Section {
  heading: string;
  content: string;
}

/**
 * Parse markdown content into sections based on ## headings.
 * Content before the first heading goes into a section with heading "".
 */
function parseSections(markdown: string): Section[] {
  const lines = markdown.split("\n");
  const sections: Section[] = [];
  let currentHeading = "";
  let currentLines: string[] = [];

  for (const line of lines) {
    const headingMatch = line.match(/^## (.+)$/);
    if (headingMatch) {
      // Save previous section
      sections.push({
        heading: currentHeading,
        content: currentLines.join("\n"),
      });
      currentHeading = headingMatch[1].trim();
      currentLines = [];
    } else {
      currentLines.push(line);
    }
  }

  // Save last section
  sections.push({
    heading: currentHeading,
    content: currentLines.join("\n"),
  });

  return sections;
}

/**
 * Merge update sections into existing content.
 * - If an update section matches an existing heading, replace that section.
 * - If an update section is new, append it.
 * - Existing sections not in updates are preserved.
 */
export function mergeContextSections(
  existingContent: string,
  updates: string
): string {
  const existingSections = parseSections(existingContent);
  const updateSections = parseSections(updates);

  // Track which existing sections have been updated
  const updatedHeadings = new Set<string>();

  // Replace existing sections with matching updates
  const merged = existingSections.map((section) => {
    const update = updateSections.find(
      (u) => u.heading !== "" && u.heading === section.heading
    );
    if (update) {
      updatedHeadings.add(update.heading);
      return update;
    }
    return section;
  });

  // Append new sections that didn't match existing headings
  for (const update of updateSections) {
    if (update.heading !== "" && !updatedHeadings.has(update.heading)) {
      merged.push(update);
    }
  }

  // Reconstruct markdown
  return merged
    .map((section) => {
      if (section.heading === "") {
        return section.content;
      }
      return `## ${section.heading}\n${section.content}`;
    })
    .join("\n");
}

// ---------------------------------------------------------------------------
// Date helpers
// ---------------------------------------------------------------------------

/** Get current date as full UTC ISO timestamp. */
export function now(): string {
  return new Date().toISOString();
}

/** Generate a URL-safe slug from a title string, prepended with a UTC timestamp. */
export function timestampedSlug(title: string): string {
  const timestamp = now().replace(/[:.]/g, "-").toLowerCase();
  return slugify(`${timestamp}-${title}`);
}

/** Generate a stable slug with date+hour prefix (no minutes/seconds). */
export function stableSlug(title: string): string {
  const dateHour = now().slice(0, 13).replace(/[:.T]/g, "-").toLowerCase();
  return slugify(`${dateHour}-${title}`);
}

/**
 * Find an existing markdown file in a directory whose frontmatter `title`
 * matches the given title. Returns the slug (basename without .md) or null.
 */
export async function findByTitle(
  dir: string,
  title: string
): Promise<string | null> {
  const slugs = await listMarkdownFiles(dir);
  for (const slug of slugs) {
    const { data } = await readMarkdown(join(dir, `${slug}.md`));
    if (data.title === title) return slug;
  }
  return null;
}

// ---------------------------------------------------------------------------
// Security / Scope Enforcement
// ---------------------------------------------------------------------------

/**
 * Enforce that the requested project matches the locked project scope.
 * Returns an error object for the MCP server if violated, or null if valid.
 */
export function enforceProjectScope(
  requestedProject: string,
  lockedProject: string | null
): { content: { type: "text"; text: string }[]; isError: true } | null {
  if (lockedProject && requestedProject !== lockedProject) {
    return {
      content: [
        {
          type: "text",
          text: `Security Violation: MCP server is locked to project '${lockedProject}'. Cannot access project '${requestedProject}'.`,
        },
      ],
      isError: true,
    };
  }
  return null;
}

