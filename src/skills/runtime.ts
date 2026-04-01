import type { ResolvedConfig, SkillDefinition } from "../types.js";
import { loadSkills } from "./loadSkills.js";
import { buildSkillsAddendum, selectSkillsForPrompt } from "./selectSkills.js";

export async function prepareSkillAddendum(
  config: ResolvedConfig,
  prompt: string,
  explicitSkillNames: string[] = [],
): Promise<{
  allSkills: SkillDefinition[];
  selectedSkills: SkillDefinition[];
  addendum: string | null;
}> {
  const allSkills = await loadSkills(config);
  const selectedSkills = selectSkillsForPrompt(
    prompt,
    allSkills,
    explicitSkillNames,
  );

  return {
    allSkills,
    selectedSkills,
    addendum: buildSkillsAddendum(selectedSkills),
  };
}
