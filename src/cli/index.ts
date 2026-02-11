import { Command } from 'commander';
import { initCommand } from './commands/init.js';
import { updateCommand } from './commands/update.js';
import { getCurrentVersion } from '../core/config.js';

const program = new Command();

program
  .name('ai-factory')
  .description('CLI tool for automating Claude Code context setup')
  .version(getCurrentVersion());

program
  .command('init')
  .description('Initialize ai-factory in current project')
  .action(initCommand);

program
  .command('update')
  .description('Update installed skills to latest version')
  .action(updateCommand);

program.parse();
