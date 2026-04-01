import type { SkillDefinition } from "../types.js";

export function selectSkillsForPrompt(
  prompt: string,
  skills: SkillDefinition[],
  explicitSkillNames: string[] = [],
): SkillDefinition[] {
  if (skills.length === 0) {
    return [];
  }

  const requested = new Set(explicitSkillNames.map((item) => item.toLowerCase()));
  if (requested.size > 0) {
    return skills.filter((skill) => requested.has(skill.name.toLowerCase()));
  }

  const normalizedPrompt = prompt.toLowerCase();
  const scored = skills
    .map((skill) => ({
      skill,
      score: scoreSkill(normalizedPrompt, skill),
    }))
    .filter((entry) => entry.score > 0)
    .sort((left, right) => right.score - left.score)
    .slice(0, 3);

  return scored.map((entry) => entry.skill);
}

export function buildSkillsAddendum(skills: SkillDefinition[]): string | null {
  if (skills.length === 0) {
    return null;
  }

  const sections = [
    "The following local skills are relevant for this request. Follow them as additional task-specific instructions.",
  ];

  for (const skill of skills) {
    sections.push(`Skill: ${skill.name}`);
    sections.push(`Description: ${skill.description}`);
    sections.push(skill.content);
  }

  return sections.join("\n\n");
}

function scoreSkill(prompt: string, skill: SkillDefinition): number {
  let score = 0;
  const skillName = skill.name.toLowerCase();
  if (prompt.includes(skillName)) {
    score += 5;
  }

  for (const trigger of skill.triggers) {
    if (prompt.includes(trigger)) {
      score += 3;
    }
  }

  const descriptionWords = skill.description.toLowerCase().split(/[^\p{L}\p{N}]+/u);
  for (const word of descriptionWords) {
    if (word.length >= 4 && prompt.includes(word)) {
      score += 1;
    }
  }

  return score;
}
