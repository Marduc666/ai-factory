import path from 'path';
import { createRequire } from 'module';
import { readJsonFile, writeJsonFile, fileExists } from '../utils/fs.js';
import { getAgentConfig } from './agents.js';

const require = createRequire(import.meta.url);
const pkg = require('../../package.json');

export interface AiFactoryConfig {
  version: string;
  agent: string;
  skillsDir: string;
  installedSkills: string[];
  mcp: {
    github: boolean;
    filesystem: boolean;
    postgres: boolean;
    chromeDevtools: boolean;
  };
}

const CONFIG_FILENAME = '.ai-factory.json';
const CURRENT_VERSION: string = pkg.version;

function resolveAgentId(agentId: string | undefined): string {
  if (!agentId) {
    return 'claude';
  }

  try {
    getAgentConfig(agentId);
    return agentId;
  } catch {
    return 'claude';
  }
}

export function getConfigPath(projectDir: string): string {
  return path.join(projectDir, CONFIG_FILENAME);
}

export function createDefaultConfig(agentId: string = 'claude'): AiFactoryConfig {
  const resolvedAgentId = resolveAgentId(agentId);
  const agent = getAgentConfig(resolvedAgentId);

  return {
    version: CURRENT_VERSION,
    agent: resolvedAgentId,
    skillsDir: agent.skillsDir,
    installedSkills: [],
    mcp: {
      github: false,
      filesystem: false,
      postgres: false,
      chromeDevtools: false,
    },
  };
}

export function migrateConfig(config: Partial<AiFactoryConfig>): AiFactoryConfig {
  const resolvedAgentId = resolveAgentId(config.agent);
  const defaults = createDefaultConfig(resolvedAgentId);

  return {
    ...defaults,
    ...config,
    agent: resolvedAgentId,
    installedSkills: Array.isArray(config.installedSkills) ? config.installedSkills : defaults.installedSkills,
    mcp: {
      ...defaults.mcp,
      ...(config.mcp ?? {}),
      
    },
  };
}

export async function loadConfig(projectDir: string): Promise<AiFactoryConfig | null> {
  const configPath = getConfigPath(projectDir);
  const loadedConfig = await readJsonFile<Partial<AiFactoryConfig>>(configPath);

  if (!loadedConfig) {
    return null;
  }

  return migrateConfig(loadedConfig); 
}

export async function saveConfig(projectDir: string, config: AiFactoryConfig): Promise<void> {
  const configPath = getConfigPath(projectDir);
  await writeJsonFile(configPath, config);
}

export async function configExists(projectDir: string): Promise<boolean> {
  const configPath = getConfigPath(projectDir);
  return fileExists(configPath);
}

export function getCurrentVersion(): string {
  return CURRENT_VERSION;
}
