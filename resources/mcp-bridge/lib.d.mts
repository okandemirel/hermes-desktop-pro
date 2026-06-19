export const MAX_DEPTH: number;

export interface McpTool {
  name: string;
  description: string;
  inputSchema: {
    type: string;
    properties: Record<string, unknown>;
    required?: string[];
    additionalProperties?: boolean;
  };
}

export const TOOLS: McpTool[];

export function cleanCliOutput(raw: string): string;
export function validateProfileName(name: string, knownProfiles: string[]): boolean;
export function evaluateGuardrails(
  targetProfile: string,
  env: Record<string, string | undefined>,
): { allowed: boolean; reason?: string; childEnv: Record<string, string> };
export function enumerateProfiles(hermesHome: string): string[];
