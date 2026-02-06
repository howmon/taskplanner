import OpenAI from 'openai';
import { getConfig } from './config.js';
import { listTasks, getMyDayTasks, createTask, listSprints } from './github.js';

let _openai = null;

function getOpenAI() {
  if (!_openai) {
    const config = getConfig();
    if (!config.openai_api_key) {
      throw new Error('OpenAI API key not configured. Set OPENAI_API_KEY in .env or run `tp init`.');
    }
    _openai = new OpenAI({ apiKey: config.openai_api_key });
  }
  return _openai;
}

function isAIAvailable() {
  const config = getConfig();
  return !!config.openai_api_key;
}

/**
 * AI: Plan my day - suggest which tasks to focus on
 */
export async function planMyDay() {
  if (!isAIAvailable()) {
    // Fallback: use simple priority-based planning
    return await simpleDayPlan();
  }

  const openai = getOpenAI();
  const tasks = await listTasks();
  const today = new Date().toISOString().split('T')[0];

  const taskSummary = tasks
    .filter(t => t.status !== 'done')
    .map(t => `#${t.id}: "${t.title}" [${t.priority}] [${t.status}] due:${t.due_date || 'none'} est:${t.estimated_hours}h`)
    .join('\n');

  const response = await openai.chat.completions.create({
    model: 'gpt-4o-mini',
    messages: [
      {
        role: 'system',
        content: `You are a smart task planning assistant. Today is ${today}. 
Analyze the user's tasks and suggest a focused plan for today.
Prioritize: overdue tasks, tasks due today, urgent/high priority items, and in-progress work.
Suggest 3-7 tasks maximum for a realistic day.
Return JSON format: { "plan": [{ "id": number, "reason": string }], "summary": string, "tip": string }`
      },
      {
        role: 'user',
        content: `Here are my tasks:\n${taskSummary}\n\nPlan my day.`
      }
    ],
    response_format: { type: 'json_object' },
    temperature: 0.7,
  });

  const plan = JSON.parse(response.choices[0].message.content);

  // Map plan IDs back to full task objects
  const taskMap = new Map(tasks.map(t => [t.id, t]));
  plan.plan = plan.plan.map(p => ({
    ...p,
    task: taskMap.get(p.id) || null,
  })).filter(p => p.task);

  return plan;
}

/**
 * Simple priority-based day planning (no AI required)
 */
async function simpleDayPlan() {
  const myDay = await getMyDayTasks();
  const today = new Date().toISOString().split('T')[0];

  const focusTasks = [
    ...myDay.overdue.map(t => ({ id: t.id, task: t, reason: `⚠️ Overdue (was due ${t.due_date})` })),
    ...myDay.due_today.map(t => ({ id: t.id, task: t, reason: '📅 Due today' })),
    ...myDay.in_progress.map(t => ({ id: t.id, task: t, reason: '🔄 Currently in progress' })),
    ...myDay.my_day.map(t => ({ id: t.id, task: t, reason: '⭐ Added to My Day' })),
  ].slice(0, 7);

  return {
    plan: focusTasks,
    summary: `${focusTasks.length} tasks planned for today based on priority and deadlines.`,
    tip: 'Set OPENAI_API_KEY for smarter AI-powered planning! 🤖',
  };
}

/**
 * AI: Decompose a task into subtasks
 */
export async function decomposeTask(taskId) {
  if (!isAIAvailable()) {
    throw new Error('AI features require OPENAI_API_KEY. Set it in .env or run `tp init`.');
  }

  const openai = getOpenAI();
  const task = (await listTasks()).find(t => t.id === taskId);
  if (!task) throw new Error(`Task #${taskId} not found`);

  const response = await openai.chat.completions.create({
    model: 'gpt-4o-mini',
    messages: [
      {
        role: 'system',
        content: `You are a project management assistant. Break down a task into smaller, actionable subtasks.
Each subtask should be specific, measurable, and completable in a few hours.
Return JSON: { "subtasks": [{ "title": string, "description": string, "estimated_hours": number, "priority": "high"|"medium"|"low" }] }`
      },
      {
        role: 'user',
        content: `Break down this task:\nTitle: ${task.title}\nDescription: ${task.body || 'No description'}\nPriority: ${task.priority}`
      }
    ],
    response_format: { type: 'json_object' },
    temperature: 0.7,
  });

  const result = JSON.parse(response.choices[0].message.content);

  // Create subtasks as GitHub issues
  const created = [];
  for (const sub of result.subtasks) {
    const newTask = await createTask(sub.title, {
      description: sub.description,
      priority: sub.priority,
      estimated_hours: sub.estimated_hours,
      parent_task: taskId,
      sprint_id: task.sprint_id,
    });
    created.push(newTask);
  }

  return { parent: task, subtasks: created };
}

/**
 * AI: Suggest priority for a task
 */
export async function suggestPriority(title, description = '') {
  if (!isAIAvailable()) {
    return { priority: 'medium', reason: 'Default priority (AI not configured)' };
  }

  const openai = getOpenAI();

  const response = await openai.chat.completions.create({
    model: 'gpt-4o-mini',
    messages: [
      {
        role: 'system',
        content: `Analyze this task and suggest a priority level.
Consider: urgency, impact, complexity, and dependencies.
Return JSON: { "priority": "urgent"|"high"|"medium"|"low", "reason": string }`
      },
      {
        role: 'user',
        content: `Task: ${title}\nDescription: ${description || 'N/A'}`
      }
    ],
    response_format: { type: 'json_object' },
    temperature: 0.3,
  });

  return JSON.parse(response.choices[0].message.content);
}

/**
 * AI: Generate task description from title
 */
export async function generateDescription(title) {
  if (!isAIAvailable()) {
    return { description: '' };
  }

  const openai = getOpenAI();

  const response = await openai.chat.completions.create({
    model: 'gpt-4o-mini',
    messages: [
      {
        role: 'system',
        content: `Generate a clear, actionable task description from the title. Include acceptance criteria.
Return JSON: { "description": string }`
      },
      {
        role: 'user',
        content: `Task title: ${title}`
      }
    ],
    response_format: { type: 'json_object' },
    temperature: 0.7,
  });

  return JSON.parse(response.choices[0].message.content);
}

export { isAIAvailable };
