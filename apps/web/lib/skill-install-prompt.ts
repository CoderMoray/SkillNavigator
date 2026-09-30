import { SKILL_INSTALL_PROMPT_TEMPLATE } from "./generated/skill-install-prompt";
import type { RegistrySkill } from "./types";

/** The only placeholder the build leaves for us: everything else is per-deployment. */
const SKILL_SLUG_PLACEHOLDER = "{{skill_slug}}";

/**
 * Text copied by the skill detail page's "copy prompt" button.
 *
 * The wording lives in `apps/web/content/prompts/skill-install-prompt.md` so it
 * can be edited without touching TS; `scripts/sync-usage-public.mjs` compiles
 * that template into `SKILL_INSTALL_PROMPT_TEMPLATE` with `{{registry_api_url}}`,
 * `{{web_url}}` and `{{brand_name}}` already resolved for this deployment.
 */
export function buildSkillInstallPrompt(input: { skill: Pick<RegistrySkill, "slug"> }): string {
  return SKILL_INSTALL_PROMPT_TEMPLATE.replaceAll(SKILL_SLUG_PLACEHOLDER, input.skill.slug);
}
