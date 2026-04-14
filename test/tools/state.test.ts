import { describe, it, expect, vi, beforeEach } from "vitest";
import { requireAgentState, registerStateTools } from "../../src/tools/state.js";
import { join } from "node:path";
import * as fs from "node:fs/promises";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

vi.mock("node:fs/promises", () => ({
  readFile: vi.fn(),
  writeFile: vi.fn(),
}));

describe("state machine capabilities", () => {
  const mockBrainDir = "/mock/brain";
  const project = "test-project";
  const stateFile = join(mockBrainDir, "projects", project, ".agent_state");

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("requireAgentState", () => {
    it("should allow if state matches (single state)", async () => {
      vi.mocked(fs.readFile).mockResolvedValue("planning");
      await expect(requireAgentState(mockBrainDir, project, "planning")).resolves.toBeUndefined();
      expect(fs.readFile).toHaveBeenCalledWith(stateFile, "utf-8");
    });

    it("should allow if state matches (array of states)", async () => {
      vi.mocked(fs.readFile).mockResolvedValue("execution");
      await expect(requireAgentState(mockBrainDir, project, ["planning", "execution"])).resolves.toBeUndefined();
    });

    it("should throw an error if state does not match", async () => {
      vi.mocked(fs.readFile).mockResolvedValue("research");
      await expect(requireAgentState(mockBrainDir, project, "execution")).rejects.toThrow(
        /State Lock: You must be in the 'execution' phase/
      );
    });

    it("should throw an error with combined string if array of states misses matching state", async () => {
      vi.mocked(fs.readFile).mockResolvedValue("research");
      await expect(requireAgentState(mockBrainDir, project, ["planning", "execution"])).rejects.toThrow(
        /State Lock: You must be in the 'planning or execution' phase/
      );
    });

    it("should default to research implicitly if file does not exist (ENOENT)", async () => {
      const enoentError = new Error("Not found") as any;
      enoentError.code = "ENOENT";
      vi.mocked(fs.readFile).mockRejectedValue(enoentError);
      
      // Should fail if expecting execution
      await expect(requireAgentState(mockBrainDir, project, "execution")).rejects.toThrow(
        /Current phase is 'research'/
      );

      // Should succeed if expecting research
      await expect(requireAgentState(mockBrainDir, project, "research")).resolves.toBeUndefined();
    });

    it("should throw generic read errors completely", async () => {
      const genericError = new Error("EACCES Permission denied");
      vi.mocked(fs.readFile).mockRejectedValue(genericError);

      await expect(requireAgentState(mockBrainDir, project, "research")).rejects.toThrow(
        /Failed to read agent state: EACCES Permission denied/
      );
    });
  });

  describe("registerStateTools", () => {
    // To test the MCP tool registration, we mock the server's `.tool` method.
    let serverMock: any;
    
    beforeEach(() => {
      serverMock = {
        tool: vi.fn(),
      };
      registerStateTools(serverMock as any, mockBrainDir, null);
    });

    it("should register set_agent_state and get_agent_state", () => {
      expect(serverMock.tool).toHaveBeenCalledTimes(2);
      expect(serverMock.tool.mock.calls[0][0]).toBe("set_agent_state");
      expect(serverMock.tool.mock.calls[1][0]).toBe("get_agent_state");
    });

    describe("set_agent_state", () => {
      it("should write the state into the file", async () => {
        const handler = serverMock.tool.mock.calls[0][3];
        const res = await handler({ project, state: "planning" });
        expect(res.isError).toBeUndefined();
        expect(res.content[0].text).toContain("successfully transitioned to: planning");
        expect(fs.writeFile).toHaveBeenCalledWith(stateFile, "planning", "utf-8");
      });

      it("should fail if project is locked and requested differs", async () => {
        serverMock.tool.mockClear();
        registerStateTools(serverMock as any, mockBrainDir, "locked-project");
        const handler = serverMock.tool.mock.calls[0][3];
        
        await expect(handler({ project: "wrong-project", state: "planning" })).rejects.toThrow(
          /Repo is locked to project 'locked-project'/
        );
      });

      it("should return an error block if writeFile fails", async () => {
        vi.mocked(fs.writeFile).mockRejectedValue(new Error("Disk Full"));
        const handler = serverMock.tool.mock.calls[0][3];
        const res = await handler({ project, state: "planning" });
        expect(res.isError).toBe(true);
        expect(res.content[0].text).toContain("Failed to set agent state: Disk Full");
      });
    });

    describe("get_agent_state", () => {
      it("should read the current state from file", async () => {
        vi.mocked(fs.readFile).mockResolvedValue("execution");
        const handler = serverMock.tool.mock.calls[1][3];
        const res = await handler({ project });
        expect(res.isError).toBeUndefined();
        expect(res.content[0].text).toContain("Current state: execution");
      });

      it("should default to research on ENOENT", async () => {
        const enoentError = new Error("Not found") as any;
        enoentError.code = "ENOENT";
        vi.mocked(fs.readFile).mockRejectedValue(enoentError);
        
        const handler = serverMock.tool.mock.calls[1][3];
        const res = await handler({ project });
        expect(res.isError).toBeUndefined();
        expect(res.content[0].text).toContain("Current state: research (default)");
      });

      it("should return an error block on other read errors", async () => {
        vi.mocked(fs.readFile).mockRejectedValue(new Error("EIO Input/output error"));
        const handler = serverMock.tool.mock.calls[1][3];
        const res = await handler({ project });
        expect(res.isError).toBe(true);
        expect(res.content[0].text).toContain("Failed to get agent state: EIO Input/output error");
      });
    });
  });
});
