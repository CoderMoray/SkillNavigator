export const PLATFORM_AGENT_PROMPT_DOC_SLUG = "platform-agent-prompt";

/** Extract the ```text fenced block from the platform agent prompt doc markdown. */
export function extractPlatformAgentPrompt(markdown: string): string | null {
  const match = markdown.match(/```text\r?\n([\s\S]*?)```/);
  return match?.[1]?.trim() ?? null;
}
