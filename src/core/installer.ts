import path from 'path';
import { copyDirectory, getSkillsDir, ensureDir, listDirectories, readTextFile, writeTextFile, fileExists } from '../utils/fs.js';
import type { AiFactoryConfig } from './config.js';
import { getAgentConfig } from './agents.js';
import { processSkillTemplates, buildTemplateVars, processTemplate } from './template.js';
import { getTransformer } from './transformer.js';

export interface InstallOptions {
  projectDir: string;
  skillsDir: string;
  skills: string[];
  stack: string | null;
  agentId: string;
}

async function installSkillWithTransformer(
  sourceSkillDir: string,
  skillName: string,
  projectDir: string,
  skillsDir: string,
  agentId: string,
  agentConfig: ReturnType<typeof getAgentConfig>,
): Promise<void> {
  const transformer = getTransformer(agentId);
  const skillMdPath = path.join(sourceSkillDir, 'SKILL.md');
  const content = await readTextFile(skillMdPath);
  if (!content) {
    throw new Error(`SKILL.md not found in ${sourceSkillDir}`);
  }

  const result = transformer.transform(skillName, content);
  const vars = buildTemplateVars(agentConfig);

  if (result.flat) {
    const targetPath = path.join(projectDir, agentConfig.configDir, result.targetDir, result.targetName);
    await writeTextFile(targetPath, processTemplate(result.content, vars));
  } else {
    const targetSkillDir = path.join(projectDir, skillsDir, result.targetDir);
    await copyDirectory(sourceSkillDir, targetSkillDir);
    if (result.content !== content) {
      await writeTextFile(path.join(targetSkillDir, 'SKILL.md'), result.content);
    }
    await processSkillTemplates(targetSkillDir, agentConfig);
  }
}

async function reconcileCustomSkills(customSkills: string[], projectDir: string, config: AiFactoryConfig): Promise<string[]> {
  const packageSkillsDir = getSkillsDir();
  const reconciledCustomSkills: string[] = [];
  const agentConfig = getAgentConfig(config.agent);

  for (const customSkill of customSkills) {
    const [stack, templateSkill] = customSkill.split('/');

    if (!stack || !templateSkill) {
      console.warn(`Warning: Invalid custom skill entry "${customSkill}". Skipping.`);
      continue;
    }

    const templateSkillDir = path.join(packageSkillsDir, '_templates', stack, templateSkill);

    if (await fileExists(path.join(templateSkillDir, 'SKILL.md'))) {
      try {
        await installSkillWithTransformer(
          templateSkillDir,
          templateSkill,
          projectDir,
          config.skillsDir,
          config.agent,
          agentConfig,
        );
        reconciledCustomSkills.push(customSkill);
      } catch (error) {
        console.warn(`Warning: Could not reconcile custom skill "${customSkill}": ${error}`);
      }
      continue;
    }

    console.warn(`Warning: Custom skill source not found for "${customSkill}". Skipping.`);
  }

  return reconciledCustomSkills;
}

export async function installSkills(options: InstallOptions): Promise<string[]> {
  const { projectDir, skillsDir, skills, stack, agentId } = options;
  const installedSkills: string[] = [];
  const agentConfig = getAgentConfig(agentId);

  const targetDir = path.join(projectDir, skillsDir);
  await ensureDir(targetDir);

  const packageSkillsDir = getSkillsDir();

  for (const skill of skills) {
    const sourceSkillDir = path.join(packageSkillsDir, skill);

    try {
      await installSkillWithTransformer(sourceSkillDir, skill, projectDir, skillsDir, agentId, agentConfig);
      installedSkills.push(skill);
    } catch (error) {
      console.warn(`Warning: Could not install skill "${skill}": ${error}`);
    }
  }

  if (stack) {
    const templateDir = path.join(packageSkillsDir, '_templates', stack);
    try {
      const templateSkills = await listDirectories(templateDir);
      for (const templateSkill of templateSkills) {
        const sourceDir = path.join(templateDir, templateSkill);

        await installSkillWithTransformer(sourceDir, templateSkill, projectDir, skillsDir, agentId, agentConfig);
        installedSkills.push(`${stack}/${templateSkill}`);
      }
    } catch {
      // Template not found, skip
    }
  }

  const transformer = getTransformer(agentId);
  if (transformer.postInstall) {
    await transformer.postInstall(projectDir);
  }

  return installedSkills;
}

export async function getAvailableSkills(): Promise<string[]> {
  const packageSkillsDir = getSkillsDir();
  const dirs = await listDirectories(packageSkillsDir);
  return dirs.filter(dir => !dir.startsWith('_'));
}

export async function getAvailableTemplates(): Promise<string[]> {
  const templatesDir = path.join(getSkillsDir(), '_templates');
  return listDirectories(templatesDir);
}

export async function updateSkills(config: AiFactoryConfig, projectDir: string): Promise<string[]> {
  const availableSkills = await getAvailableSkills();
  const customSkills = config.installedSkills.filter(s => s.includes('/'));

  const installedBaseSkills = await installSkills({
    projectDir,
    skillsDir: config.skillsDir,
    skills: availableSkills,
    stack: null,
    agentId: config.agent,
  });

  const reconciledCustomSkills = await reconcileCustomSkills(customSkills, projectDir, config);

  return [...installedBaseSkills, ...reconciledCustomSkills];
}
