import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

export function registerUiTools(server: McpServer, getUiUrl: () => string | null): void {
  server.registerTool(
    "get_dashboard_url",
    {
      title: "Get Dashboard URL",
      description: "Returns the URL of the running BYOBrain Dashboard.",
      inputSchema: {},
    },
    async () => {
      const url = getUiUrl();
      if (!url) {
        return {
          content: [
            {
              type: "text" as const,
              text: "Dashboard is not running. Start the server with the --ui flag to enable the dashboard.",
            },
          ],
        };
      }

      return {
        content: [
          {
            type: "text" as const,
            text: [
              `Dashboard is running at: ${url}`,
              `Deep Link Base: byobrain://`,
              `Usage: byobrain://[project]/[type]/[slug]`
            ].join("\n"),
          },
        ],
      };
    }
  );
}
