#!/usr/bin/env node

import { Command } from 'commander';
import chalk from 'chalk';
import ora from 'ora';
import Table from 'cli-table3';
import { getConfig, saveConfig, validateConfig } from '../core/config.js';
import {
  initializeRepo, createTask, getTask, updateTask, listTasks,
  deleteTask, createSprint, listSprints, closeSprint,
  getBoardData, getAnalytics, getMyDayTasks, toggleMyDay,
} from '../core/github.js';
import { sendNotification, sendMorningBriefing, sendOverdueAlert, sendTaskCompleted } from '../core/notifications.js';
import { planMyDay, decomposeTask, isAIAvailable } from '../core/ai.js';
import { startServer } from '../web/server.js';

const program = new Command();

program
  .name('tp')
  .description('🧠 AI-Powered Task Planner — GitHub Issues as your task backend')
  .version('1.0.0');

// ─── Init ──────────────────────────────────────────────────────────────

program
  .command('init')
  .description('Initialize TaskPlanner for the current repo')
  .action(async () => {
    const spinner = ora('Initializing TaskPlanner...').start();
    try {
      const config = getConfig();
      const errors = validateConfig(config);
      if (errors.length) {
        spinner.fail('Configuration errors:');
        errors.forEach(e => console.log(chalk.red(`  ✗ ${e}`)));
        return;
      }

      const result = await initializeRepo();
      saveConfig(config);

      spinner.succeed('TaskPlanner initialized!');
      console.log(chalk.dim(`  Repo: ${config.owner}/${config.repo}`));
      if (result.created.length) {
        console.log(chalk.green(`  Created labels: ${result.created.join(', ')}`));
      }
      if (result.existing.length) {
        console.log(chalk.dim(`  Existing labels: ${result.existing.join(', ')}`));
      }
      console.log(chalk.cyan('\n  Next: Run `tp add "My first task"` to create a task!'));
    } catch (error) {
      spinner.fail(`Failed: ${error.message}`);
    }
  });

// ─── Add Task ──────────────────────────────────────────────────────────

program
  .command('add <title>')
  .description('Add a new task')
  .option('-p, --priority <level>', 'Priority: urgent, high, medium, low', 'medium')
  .option('-s, --status <status>', 'Status: todo, in-progress', 'todo')
  .option('-d, --due <date>', 'Due date (YYYY-MM-DD)')
  .option('-a, --assign <user>', 'Assign to GitHub user')
  .option('-m, --sprint <id>', 'Add to sprint (milestone number)', parseInt)
  .option('--my-day', 'Add to My Day')
  .option('-e, --estimate <hours>', 'Estimated hours', parseFloat)
  .option('--desc <description>', 'Task description')
  .action(async (title, options) => {
    const spinner = ora('Creating task...').start();
    try {
      const task = await createTask(title, {
        priority: options.priority,
        status: options.status,
        due_date: options.due || null,
        assignee: options.assign || null,
        sprint_id: options.sprint || null,
        my_day: options.myDay || false,
        estimated_hours: options.estimate || 0,
        description: options.desc || '',
      });
      spinner.succeed(`Task created: ${chalk.bold(`#${task.id}`)} ${task.title}`);
      const prioColors = { urgent: 'red', high: 'yellow', medium: 'cyan', low: 'green' };
      console.log(chalk.dim(`  Priority: `) + chalk[prioColors[task.priority]](task.priority));
      if (task.due_date) console.log(chalk.dim(`  Due: ${task.due_date}`));
      console.log(chalk.dim(`  URL: ${task.html_url}`));
    } catch (error) {
      spinner.fail(`Failed: ${error.message}`);
    }
  });

// ─── List Tasks ────────────────────────────────────────────────────────

program
  .command('list')
  .description('List tasks')
  .option('-s, --status <status>', 'Filter by status')
  .option('-p, --priority <level>', 'Filter by priority')
  .option('--sprint <id>', 'Filter by sprint', parseInt)
  .option('-a, --assignee <user>', 'Filter by assignee')
  .action(async (options) => {
    const spinner = ora('Fetching tasks...').start();
    try {
      const tasks = await listTasks({
        status: options.status,
        priority: options.priority,
        sprint_id: options.sprint,
        assignee: options.assignee,
      });

      spinner.stop();

      if (tasks.length === 0) {
        console.log(chalk.dim('  No tasks found.'));
        return;
      }

      const table = new Table({
        head: ['#', 'Title', 'Status', 'Priority', 'Due', 'Assignee', 'Sprint'].map(h => chalk.bold.cyan(h)),
        colWidths: [7, 40, 14, 10, 12, 14, 16],
        style: { 'padding-left': 1, 'padding-right': 1 },
      });

      const statusIcons = { todo: '⬜', 'in-progress': '🔄', done: '✅', blocked: '🚫' };
      const prioIcons = { urgent: '🔴', high: '🟠', medium: '🟡', low: '🟢' };

      for (const task of tasks) {
        table.push([
          chalk.dim(`#${task.id}`),
          task.title.slice(0, 38),
          `${statusIcons[task.status] || '⬜'} ${task.status}`,
          `${prioIcons[task.priority] || '⚪'} ${task.priority}`,
          task.due_date || chalk.dim('—'),
          task.assignee || chalk.dim('—'),
          task.sprint_name || chalk.dim('—'),
        ]);
      }

      console.log(table.toString());
      console.log(chalk.dim(`\n  ${tasks.length} task(s) found`));
    } catch (error) {
      spinner.fail(`Failed: ${error.message}`);
    }
  });

// ─── Today / My Day ───────────────────────────────────────────────────

program
  .command('today')
  .description('Show My Day — tasks for today')
  .action(async () => {
    const spinner = ora('Planning your day...').start();
    try {
      const myDay = await getMyDayTasks();
      spinner.stop();

      console.log(chalk.bold.cyan('\n  ☀️  My Day — ' + new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })));
      console.log(chalk.dim('  ─'.repeat(30)));

      const prioIcons = { urgent: '🔴', high: '🟠', medium: '🟡', low: '🟢' };

      if (myDay.overdue.length) {
        console.log(chalk.red.bold('\n  ⚠️  Overdue'));
        for (const t of myDay.overdue) {
          console.log(`    ${prioIcons[t.priority]} #${t.id} ${t.title} ${chalk.red(`(due ${t.due_date})`)}`);
        }
      }

      if (myDay.due_today.length) {
        console.log(chalk.yellow.bold('\n  📅 Due Today'));
        for (const t of myDay.due_today) {
          console.log(`    ${prioIcons[t.priority]} #${t.id} ${t.title}`);
        }
      }

      if (myDay.in_progress.length) {
        console.log(chalk.blue.bold('\n  🔄 In Progress'));
        for (const t of myDay.in_progress) {
          console.log(`    ${prioIcons[t.priority]} #${t.id} ${t.title}`);
        }
      }

      if (myDay.my_day.length) {
        console.log(chalk.magenta.bold('\n  ⭐ My Day'));
        for (const t of myDay.my_day) {
          console.log(`    ${prioIcons[t.priority]} #${t.id} ${t.title}`);
        }
      }

      if (myDay.total_focus === 0) {
        console.log(chalk.green('\n  ✨ No tasks for today. Enjoy your day!'));
      } else {
        console.log(chalk.dim(`\n  ${myDay.total_focus} task(s) to focus on`));
      }
    } catch (error) {
      spinner.fail(`Failed: ${error.message}`);
    }
  });

// ─── Board (Terminal Kanban) ───────────────────────────────────────────

program
  .command('board')
  .description('Show Kanban board')
  .option('--sprint <id>', 'Filter by sprint', parseInt)
  .action(async (options) => {
    const spinner = ora('Loading board...').start();
    try {
      const columns = await getBoardData({ sprint_id: options.sprint });
      spinner.stop();

      const prioIcons = { urgent: '🔴', high: '🟠', medium: '🟡', low: '🟢' };

      console.log(chalk.bold.cyan('\n  📋 Kanban Board'));
      console.log(chalk.dim('  ─'.repeat(40)));

      for (const [status, col] of Object.entries(columns)) {
        const count = col.tasks.length;
        console.log(`\n  ${chalk.bold(col.title)} (${count})`);
        if (count === 0) {
          console.log(chalk.dim('    (empty)'));
        }
        for (const task of col.tasks) {
          const prio = prioIcons[task.priority] || '⚪';
          const due = task.due_date ? chalk.dim(` [${task.due_date}]`) : '';
          const assignee = task.assignee ? chalk.dim(` @${task.assignee}`) : '';
          console.log(`    ${prio} #${task.id} ${task.title}${due}${assignee}`);
        }
      }
      console.log();
    } catch (error) {
      spinner.fail(`Failed: ${error.message}`);
    }
  });

// ─── Move Task ─────────────────────────────────────────────────────────

program
  .command('move <id> <status>')
  .description('Move task to new status (todo, in-progress, done, blocked)')
  .action(async (id, status) => {
    const validStatuses = ['todo', 'in-progress', 'done', 'blocked'];
    if (!validStatuses.includes(status)) {
      console.log(chalk.red(`Invalid status. Use: ${validStatuses.join(', ')}`));
      return;
    }
    const spinner = ora(`Moving task #${id}...`).start();
    try {
      const task = await updateTask(parseInt(id), { status });
      const statusIcons = { todo: '⬜', 'in-progress': '🔄', done: '✅', blocked: '🚫' };
      spinner.succeed(`#${task.id} → ${statusIcons[status]} ${status}`);
    } catch (error) {
      spinner.fail(`Failed: ${error.message}`);
    }
  });

// ─── Assign Task ───────────────────────────────────────────────────────

program
  .command('assign <id> <user>')
  .description('Assign task to a user')
  .action(async (id, user) => {
    const spinner = ora(`Assigning task #${id}...`).start();
    try {
      const task = await updateTask(parseInt(id), { assignee: user });
      spinner.succeed(`#${task.id} assigned to @${user}`);
    } catch (error) {
      spinner.fail(`Failed: ${error.message}`);
    }
  });

// ─── Priority ──────────────────────────────────────────────────────────

program
  .command('priority <id> <level>')
  .description('Set task priority (urgent, high, medium, low)')
  .action(async (id, level) => {
    const validLevels = ['urgent', 'high', 'medium', 'low'];
    if (!validLevels.includes(level)) {
      console.log(chalk.red(`Invalid priority. Use: ${validLevels.join(', ')}`));
      return;
    }
    const spinner = ora(`Setting priority...`).start();
    try {
      const task = await updateTask(parseInt(id), { priority: level });
      const prioIcons = { urgent: '🔴', high: '🟠', medium: '🟡', low: '🟢' };
      spinner.succeed(`#${task.id} → ${prioIcons[level]} ${level}`);
    } catch (error) {
      spinner.fail(`Failed: ${error.message}`);
    }
  });

// ─── Sprint Commands ───────────────────────────────────────────────────

const sprintCmd = program
  .command('sprint')
  .description('Sprint management');

sprintCmd
  .command('list')
  .description('List sprints')
  .option('--all', 'Include closed sprints')
  .action(async (options) => {
    const spinner = ora('Fetching sprints...').start();
    try {
      const sprints = await listSprints(options.all ? 'all' : 'open');
      spinner.stop();

      if (sprints.length === 0) {
        console.log(chalk.dim('  No sprints found. Create one: tp sprint create "Sprint 1"'));
        return;
      }

      const table = new Table({
        head: ['#', 'Sprint', 'Due', 'Open', 'Done', 'State'].map(h => chalk.bold.cyan(h)),
        style: { 'padding-left': 1, 'padding-right': 1 },
      });

      for (const sprint of sprints) {
        table.push([
          sprint.id,
          sprint.title,
          sprint.due_on ? new Date(sprint.due_on).toLocaleDateString() : chalk.dim('—'),
          sprint.open_issues,
          sprint.closed_issues,
          sprint.state === 'open' ? chalk.green('open') : chalk.dim('closed'),
        ]);
      }

      console.log(table.toString());
    } catch (error) {
      spinner.fail(`Failed: ${error.message}`);
    }
  });

sprintCmd
  .command('create <name>')
  .description('Create a new sprint')
  .option('-d, --due <date>', 'Due date (YYYY-MM-DD)')
  .option('--desc <description>', 'Sprint description')
  .action(async (name, options) => {
    const spinner = ora('Creating sprint...').start();
    try {
      const sprint = await createSprint(name, {
        due_date: options.due,
        description: options.desc,
      });
      spinner.succeed(`Sprint created: ${chalk.bold(sprint.title)} (#${sprint.id})`);
      if (sprint.due_on) console.log(chalk.dim(`  Due: ${new Date(sprint.due_on).toLocaleDateString()}`));
    } catch (error) {
      spinner.fail(`Failed: ${error.message}`);
    }
  });

sprintCmd
  .command('close <id>')
  .description('Close a sprint')
  .action(async (id) => {
    const spinner = ora('Closing sprint...').start();
    try {
      const sprint = await closeSprint(parseInt(id));
      spinner.succeed(`Sprint closed: ${sprint.title}`);
    } catch (error) {
      spinner.fail(`Failed: ${error.message}`);
    }
  });

sprintCmd
  .command('current')
  .description('Show current sprint with tasks')
  .action(async () => {
    const spinner = ora('Loading current sprint...').start();
    try {
      const sprints = await listSprints('open');
      if (sprints.length === 0) {
        spinner.info('No open sprints. Create one: tp sprint create "Sprint 1"');
        return;
      }

      const current = sprints[0];
      const tasks = await listTasks({ sprint_id: current.id, include_done: true });
      spinner.stop();

      const total = current.open_issues + current.closed_issues;
      const progress = total ? Math.round((current.closed_issues / total) * 100) : 0;
      const bar = '█'.repeat(Math.floor(progress / 5)) + '░'.repeat(20 - Math.floor(progress / 5));

      console.log(chalk.bold.cyan(`\n  🏃 ${current.title}`));
      if (current.due_on) console.log(chalk.dim(`  Due: ${new Date(current.due_on).toLocaleDateString()}`));
      console.log(`  Progress: [${chalk.green(bar)}] ${progress}% (${current.closed_issues}/${total})`);
      console.log(chalk.dim('  ─'.repeat(30)));

      const prioIcons = { urgent: '🔴', high: '🟠', medium: '🟡', low: '🟢' };
      const statusIcons = { todo: '⬜', 'in-progress': '🔄', done: '✅', blocked: '🚫' };

      for (const task of tasks) {
        console.log(`    ${statusIcons[task.status]} ${prioIcons[task.priority]} #${task.id} ${task.title}`);
      }
      console.log();
    } catch (error) {
      spinner.fail(`Failed: ${error.message}`);
    }
  });

// ─── AI Plan ───────────────────────────────────────────────────────────

program
  .command('plan')
  .description('AI-powered daily planning')
  .action(async () => {
    const spinner = ora('🤖 AI is planning your day...').start();
    try {
      const plan = await planMyDay();
      spinner.stop();

      console.log(chalk.bold.cyan('\n  🧠 AI Daily Plan'));
      console.log(chalk.dim('  ─'.repeat(30)));

      const prioIcons = { urgent: '🔴', high: '🟠', medium: '🟡', low: '🟢' };

      for (let i = 0; i < plan.plan.length; i++) {
        const item = plan.plan[i];
        const task = item.task;
        const prio = prioIcons[task.priority] || '⚪';
        console.log(`  ${chalk.bold(i + 1)}. ${prio} #${task.id} ${task.title}`);
        console.log(chalk.dim(`     ${item.reason}`));
      }

      console.log(chalk.dim(`\n  📝 ${plan.summary}`));
      if (plan.tip) console.log(chalk.yellow(`  💡 ${plan.tip}`));
      console.log();
    } catch (error) {
      spinner.fail(`Failed: ${error.message}`);
    }
  });

// ─── AI Decompose ──────────────────────────────────────────────────────

program
  .command('decompose <id>')
  .description('AI: Break down a task into subtasks')
  .action(async (id) => {
    const spinner = ora('🤖 AI is decomposing the task...').start();
    try {
      const result = await decomposeTask(parseInt(id));
      spinner.succeed(`Created ${result.subtasks.length} subtasks for #${result.parent.id}`);

      for (const sub of result.subtasks) {
        console.log(chalk.green(`  + #${sub.id} ${sub.title}`));
      }
    } catch (error) {
      spinner.fail(`Failed: ${error.message}`);
    }
  });

// ─── Notifications ─────────────────────────────────────────────────────

program
  .command('notify')
  .description('Send task notifications')
  .option('--morning', 'Send morning briefing')
  .option('--overdue', 'Send overdue alert')
  .option('--test', 'Send test notification')
  .action(async (options) => {
    try {
      if (options.test) {
        await sendNotification('Test', '🧪 TaskPlanner notifications are working!');
        console.log(chalk.green('  ✓ Test notification sent!'));
        return;
      }
      if (options.overdue) {
        const result = await sendOverdueAlert();
        console.log(chalk.green(`  ✓ ${result.message}`));
        return;
      }
      // Default: morning briefing
      const result = await sendMorningBriefing();
      if (result.success) {
        console.log(chalk.green('  ✓ Morning briefing sent!'));
      } else {
        console.log(chalk.red(`  ✗ ${result.error}`));
      }
    } catch (error) {
      console.log(chalk.red(`  Failed: ${error.message}`));
    }
  });

// ─── My Day Toggle ─────────────────────────────────────────────────────

program
  .command('myday <id>')
  .description('Toggle a task in/out of My Day')
  .action(async (id) => {
    try {
      const task = await getTask(parseInt(id));
      const newValue = !task.my_day;
      await toggleMyDay(parseInt(id), newValue);
      console.log(chalk.green(`  ${newValue ? '⭐ Added' : '✗ Removed'} #${id} ${newValue ? 'to' : 'from'} My Day`));
    } catch (error) {
      console.log(chalk.red(`  Failed: ${error.message}`));
    }
  });

// ─── Serve Web UI ──────────────────────────────────────────────────────

program
  .command('serve')
  .description('Launch the web UI')
  .option('-p, --port <port>', 'Port number', '3847')
  .action(async (options) => {
    const port = parseInt(options.port);
    await startServer(port);
  });

// ─── Stats ─────────────────────────────────────────────────────────────

program
  .command('stats')
  .description('Show task analytics')
  .option('--sprint <id>', 'Sprint to analyze', parseInt)
  .action(async (options) => {
    const spinner = ora('Calculating analytics...').start();
    try {
      const analytics = await getAnalytics(options.sprint);
      spinner.stop();

      console.log(chalk.bold.cyan('\n  📊 Task Analytics'));
      console.log(chalk.dim('  ─'.repeat(30)));

      console.log(`  Total: ${chalk.bold(analytics.total)} tasks`);
      console.log(`  Completed: ${chalk.green(analytics.completed)} (${analytics.completionRate}%)`);
      console.log(`  Overdue: ${analytics.overdue > 0 ? chalk.red(analytics.overdue) : chalk.green(0)}`);

      console.log(chalk.bold('\n  Status'));
      console.log(`    ⬜ To Do: ${analytics.statusCounts.todo}`);
      console.log(`    🔄 In Progress: ${analytics.statusCounts['in-progress']}`);
      console.log(`    ✅ Done: ${analytics.statusCounts.done}`);
      console.log(`    🚫 Blocked: ${analytics.statusCounts.blocked}`);

      console.log(chalk.bold('\n  Priority'));
      console.log(`    🔴 Urgent: ${analytics.priorityCounts.urgent}`);
      console.log(`    🟠 High: ${analytics.priorityCounts.high}`);
      console.log(`    🟡 Medium: ${analytics.priorityCounts.medium}`);
      console.log(`    🟢 Low: ${analytics.priorityCounts.low}`);

      if (Object.keys(analytics.assigneeCounts).length > 0) {
        console.log(chalk.bold('\n  Assignees'));
        for (const [assignee, count] of Object.entries(analytics.assigneeCounts)) {
          console.log(`    👤 ${assignee}: ${count}`);
        }
      }
      console.log();
    } catch (error) {
      spinner.fail(`Failed: ${error.message}`);
    }
  });

// ─── Done / Complete (Quick Action) ────────────────────────────────────

program
  .command('done <ids...>')
  .alias('complete')
  .description('Mark task(s) as done ✅')
  .action(async (ids) => {
    for (const rawId of ids) {
      const id = parseInt(rawId);
      if (isNaN(id)) {
        console.log(chalk.red(`  ✗ Invalid task ID: ${rawId}`));
        continue;
      }
      const spinner = ora(`Completing #${id}...`).start();
      try {
        const task = await updateTask(id, { status: 'done' });
        spinner.succeed(`✅ #${task.id} ${task.title} — done!`);
        try { await sendTaskCompleted(task); } catch { /* notification optional */ }
      } catch (error) {
        spinner.fail(`Failed to complete #${id}: ${error.message}`);
      }
    }
  });

// ─── Start (Quick Action) ──────────────────────────────────────────────

program
  .command('start <id>')
  .description('Start working on a task (→ in-progress)')
  .action(async (id) => {
    const spinner = ora(`Starting #${id}...`).start();
    try {
      const task = await updateTask(parseInt(id), { status: 'in-progress' });
      spinner.succeed(`🔄 #${task.id} ${task.title} — in progress`);
    } catch (error) {
      spinner.fail(`Failed: ${error.message}`);
    }
  });

// ─── Block (Quick Action) ──────────────────────────────────────────────

program
  .command('block <id>')
  .description('Mark a task as blocked')
  .action(async (id) => {
    const spinner = ora(`Blocking #${id}...`).start();
    try {
      const task = await updateTask(parseInt(id), { status: 'blocked' });
      spinner.succeed(`🚫 #${task.id} ${task.title} — blocked`);
    } catch (error) {
      spinner.fail(`Failed: ${error.message}`);
    }
  });

// ─── Reopen (Undo Complete) ────────────────────────────────────────────

program
  .command('reopen <id>')
  .description('Reopen a completed task (→ todo)')
  .action(async (id) => {
    const spinner = ora(`Reopening #${id}...`).start();
    try {
      const task = await updateTask(parseInt(id), { status: 'todo' });
      spinner.succeed(`⬜ #${task.id} ${task.title} — reopened`);
    } catch (error) {
      spinner.fail(`Failed: ${error.message}`);
    }
  });

// ─── Delete Task ───────────────────────────────────────────────────────

program
  .command('delete <id>')
  .alias('rm')
  .description('Delete a task (close as not-planned)')
  .action(async (id) => {
    const spinner = ora(`Deleting #${id}...`).start();
    try {
      await deleteTask(parseInt(id));
      spinner.succeed(`🗑️  #${id} deleted`);
    } catch (error) {
      spinner.fail(`Failed: ${error.message}`);
    }
  });

program.parse();
