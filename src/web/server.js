import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import chalk from 'chalk';
import {
  initializeRepo, createTask, getTask, updateTask, listTasks,
  deleteTask, createSprint, listSprints, closeSprint,
  getBoardData, getAnalytics, getMyDayTasks, toggleMyDay,
} from '../core/github.js';
import { planMyDay, decomposeTask, suggestPriority, isAIAvailable } from '../core/ai.js';
import { sendMorningBriefing, startNotificationScheduler } from '../core/notifications.js';
import { getConfig } from '../core/config.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export async function startServer(port = 3847) {
  const app = express();

  app.use(express.json());
  app.use(express.static(path.join(__dirname, 'public')));

  // ─── API Routes ────────────────────────────────────────────────────────

  // Health check
  app.get('/api/health', (req, res) => {
    const config = getConfig();
    res.json({
      status: 'ok',
      repo: `${config.owner}/${config.repo}`,
      ai_enabled: isAIAvailable(),
    });
  });

  // Tasks
  app.get('/api/tasks', async (req, res) => {
    try {
      const tasks = await listTasks({
        status: req.query.status || undefined,
        priority: req.query.priority || undefined,
        sprint_id: req.query.sprint_id ? parseInt(req.query.sprint_id) : undefined,
        assignee: req.query.assignee || undefined,
        my_day: req.query.my_day === 'true',
        include_done: req.query.include_done === 'true',
      });
      res.json(tasks);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  app.post('/api/tasks', async (req, res) => {
    try {
      const task = await createTask(req.body.title, req.body);
      res.json(task);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  app.get('/api/tasks/:id', async (req, res) => {
    try {
      const task = await getTask(parseInt(req.params.id));
      res.json(task);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  app.patch('/api/tasks/:id', async (req, res) => {
    try {
      const task = await updateTask(parseInt(req.params.id), req.body);
      res.json(task);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  app.delete('/api/tasks/:id', async (req, res) => {
    try {
      await deleteTask(parseInt(req.params.id));
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  // Board
  app.get('/api/board', async (req, res) => {
    try {
      const board = await getBoardData({
        sprint_id: req.query.sprint_id ? parseInt(req.query.sprint_id) : undefined,
      });
      res.json(board);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  // My Day
  app.get('/api/myday', async (req, res) => {
    try {
      const myDay = await getMyDayTasks();
      res.json(myDay);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  app.post('/api/myday/:id/toggle', async (req, res) => {
    try {
      const task = await toggleMyDay(parseInt(req.params.id), req.body.value);
      res.json(task);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  // Sprints
  app.get('/api/sprints', async (req, res) => {
    try {
      const sprints = await listSprints(req.query.state || 'open');
      res.json(sprints);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  app.post('/api/sprints', async (req, res) => {
    try {
      const sprint = await createSprint(req.body.title, req.body);
      res.json(sprint);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  app.post('/api/sprints/:id/close', async (req, res) => {
    try {
      const sprint = await closeSprint(parseInt(req.params.id));
      res.json(sprint);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  // Analytics
  app.get('/api/analytics', async (req, res) => {
    try {
      const analytics = await getAnalytics(
        req.query.sprint_id ? parseInt(req.query.sprint_id) : undefined
      );
      res.json(analytics);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  // AI
  app.post('/api/ai/plan', async (req, res) => {
    try {
      const plan = await planMyDay();
      res.json(plan);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  app.post('/api/ai/decompose/:id', async (req, res) => {
    try {
      const result = await decomposeTask(parseInt(req.params.id));
      res.json(result);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  app.post('/api/ai/suggest-priority', async (req, res) => {
    try {
      const result = await suggestPriority(req.body.title, req.body.description);
      res.json(result);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  // Notifications
  app.post('/api/notify/morning', async (req, res) => {
    try {
      const result = await sendMorningBriefing();
      res.json(result);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  // ─── Start Server ──────────────────────────────────────────────────────

  // Start notification scheduler
  const config = getConfig();
  if (config.notify_enabled) {
    startNotificationScheduler(config.notify_morning_time);
  }

  app.listen(port, () => {
    console.log(chalk.bold.cyan(`
  ┌──────────────────────────────────────────────┐
  │                                              │
  │   🧠 TaskPlanner is running!                 │
  │                                              │
  │   Web UI:  http://localhost:${port}            │
  │   API:     http://localhost:${port}/api         │
  │   Repo:    ${config.owner}/${config.repo}${' '.repeat(Math.max(0, 29 - config.owner.length - config.repo.length))}│
  │   AI:      ${isAIAvailable() ? '✅ Enabled ' : '❌ Disabled'}                       │
  │                                              │
  │   Press Ctrl+C to stop                       │
  │                                              │
  └──────────────────────────────────────────────┘
`));
  });

  return app;
}
