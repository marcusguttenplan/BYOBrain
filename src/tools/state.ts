import { join } from "node:path";
import { readFile, writeFile } from "node:fs/promises";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

export type AgentState = "research" | "planning" | "execution" | "verification";

/**
 * Ensures the agent state is currently set to an allowed state.
 * Throws an error if the state does not match, blocking the tool execution.
 */
export async function requireAgentState(brainDir: string, project: string, requiredState: AgentState | AgentState[]): Promise<void> {
  const stateFile = join(brainDir, "projects", project, ".agent_state");
  let currentState = "research"; // Default implicitly
  
  try {
    const data = await readFile(stateFile, "utf-8");
    if (data.trim()) currentState = data.trim();
  } catch (err: any) {
    // If file doesn't exist, state is research
    if (err.code !== "ENOENT") {
      throw new Error(`Failed to read agent state: ${err.message}`);
    }
  }

  const allowed = Array.isArray(requiredState) ? requiredState : [requiredState];
  if (!allowed.includes(currentState as AgentState)) {
    const requiredStr = allowed.join(" or ");
    throw new Error(
      `State Lock: You must be in the '${requiredStr}' phase to use this tool. ` +
      `Current phase is '${currentState}'. Use 'set_agent_state' to transition if appropriate.`
    );
  }
}

export function registerStateTools(server: McpServer, brainDir: string, lockedProject: string | null): void {
  // -------------------------------------------------------------------------
  // set_agent_state
  // -------------------------------------------------------------------------
  server.tool(
    "set_agent_state",
    "Change the current agent state (research, planning, execution, verification). " +
    "Use this to move through the SDLC state machine phases.",
    {
      project: z.string().describe("Project name (must match locked project if set)."),
      state: z.enum(["research", "planning", "execution", "verification"]).describe("The new state to enter."),
    },
    async ({ project, state }) => {
      if (lockedProject && project !== lockedProject) {
        throw new Error(`Repo is locked to project '${lockedProject}'. Cannot set state for '${project}'.`);
      }

      const stateFile = join(brainDir, "projects", project, ".agent_state");

      try {
        await writeFile(stateFile, state, "utf-8");
        return {
          content: [{ type: "text", text: `Agent state successfully transitioned to: ${state}` }],
        };
      } catch (err: any) {
        return {
          isError: true,
          content: [{ type: "text", text: `Failed to set agent state: ${err.message}` }],
        };
      }
    }
  );

  // -------------------------------------------------------------------------
  // get_agent_state
  // -------------------------------------------------------------------------
  server.tool(
    "get_agent_state",
    "Get the current agent state machine phase.",
    {
      project: z.string().describe("Project name."),
    },
    async ({ project }) => {
      const stateFile = join(brainDir, "projects", project, ".agent_state");
      try {
        const data = await readFile(stateFile, "utf-8");
        const state = data.trim() || "research";
        return {
          content: [{ type: "text", text: `Current state: ${state}` }],
        };
      } catch (err: any) {
        if (err.code === "ENOENT") {
          return {
            content: [{ type: "text", text: "Current state: research (default)" }],
          };
        }
        return {
          isError: true,
          content: [{ type: "text", text: `Failed to get agent state: ${err.message}` }],
        };
      }
    }
  );
}
