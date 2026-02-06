import { Octokit } from '@octokit/rest';
import { getConfig } from './config.js';
import {
  STATUS_LABELS, PRIORITY_LABELS, LABEL_COLORS,
  LABEL_DESCRIPTIONS, PRIORITY_ORDER
} from '../types/index.js';

let _octokit = null;
let _config = null;

function getOctokit() {
  if (!_octokit) {
    _config = getConfig();
    _octokit = new Octokit({ auth: _config.token });
  }
  return { octokit: _octokit, owner: _config.owner, repo: _config.repo };
}

// ─── YAML Front-Matter Parsing ─────────────────────────────────────────

function parseYamlFrontMatter(body) {
  if (!body) return { meta: {}, description: '' };

  const match = body.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/);
  if (!match) return { meta: {}, description: body };

  const yamlStr = match[1];
  const description = match[2].trim();
  const meta = {};

  for (const line of yamlStr.split('\n')) {
    const kv = line.match(/^(\w+):\s*(.*)$/);
    if (kv) {
      let value = kv[2].trim();
      if (value === 'true') value = true;
      else if (value === 'false') value = false;
      else if (value === 'null' || value === '') value = null;
      else if (/^\d+$/.test(value)) value = parseInt(value, 10);
      else if (/^\d+\.\d+$/.test(value)) value = parseFloat(value);
      else if (value.startsWith('[') && value.endsWith(']')) {
        value = value.slice(1, -1).split(',').map(s => s.trim()).filter(Boolean);
      }
      meta[kv[1]] = value;
    }
  }

  return { meta, description };
}

function buildYamlFrontMatter(meta, description) {
  const lines = ['---'];
  if (meta.priority) lines.push(`priority: ${meta.priority}`);
  if (meta.due_date) lines.push(`due_date: ${meta.due_date}`);
  lines.push(`estimated_hours: ${meta.estimated_hours || 0}`);
  lines.push(`actual_hours: ${meta.actual_hours || 0}`);
  if (meta.tags?.length) lines.push(`tags: [${meta.tags.join(', ')}]`);
  lines.push(`my_day: ${meta.my_day || false}`);
  if (meta.parent_task) lines.push(`parent_task: ${meta.parent_task}`);
  lines.push('---');
  lines.push('');
  lines.push(description || '');
  return lines.join('\n');
}

// ─── Label Helpers ─────────────────────────────────────────────────────

function getStatusFromLabels(labels) {
  const labelNames = labels.map(l => typeof l === 'string' ? l : l.name);
  for (const [status, label] of Object.entries(STATUS_LABELS)) {
    if (labelNames.includes(label)) return status;
  }
  return 'todo';
}

function getPriorityFromLabels(labels) {
  const labelNames = labels.map(l => typeof l === 'string' ? l : l.name);
  for (const [priority, label] of Object.entries(PRIORITY_LABELS)) {
    if (labelNames.includes(label)) return priority;
  }
  return 'medium';
}

function getUserLabels(labels) {
  const labelNames = labels.map(l => typeof l === 'string' ? l : l.name);
  return labelNames.filter(n => !n.startsWith('tp:'));
}

// ─── Issue → Task Conversion ───────────────────────────────────────────

function issueToTask(issue) {
  const { meta, description } = parseYamlFrontMatter(issue.body);
  return {
    id: issue.number,
    title: issue.title,
    body: description,
    status: getStatusFromLabels(issue.labels),
    priority: getPriorityFromLabels(issue.labels) || meta.priority || 'medium',
    due_date: meta.due_date || null,
    labels: getUserLabels(issue.labels),
    assignee: issue.assignee?.login || null,
    sprint_id: issue.milestone?.number || null,
    sprint_name: issue.milestone?.title || null,
    my_day: meta.my_day || false,
    estimated_hours: meta.estimated_hours || 0,
    actual_hours: meta.actual_hours || 0,
    tags: meta.tags || [],
    parent_task: meta.parent_task || null,
    created_at: issue.created_at,
    updated_at: issue.updated_at,
    html_url: issue.html_url,
  };
}

// ─── Initialization ────────────────────────────────────────────────────

export async function initializeRepo() {
  const { octokit, owner, repo } = getOctokit();

  const allLabels = { ...STATUS_LABELS, ...PRIORITY_LABELS };
  const existing = await octokit.issues.listLabelsForRepo({ owner, repo, per_page: 100 });
  const existingNames = existing.data.map(l => l.name);

  const created = [];
  for (const [key, labelName] of Object.entries(allLabels)) {
    if (!existingNames.includes(labelName)) {
      await octokit.issues.createLabel({
        owner, repo,
        name: labelName,
        color: LABEL_COLORS[labelName],
        description: LABEL_DESCRIPTIONS[labelName],
      });
      created.push(labelName);
    }
  }

  return { created, existing: existingNames.filter(n => n.startsWith('tp:')) };
}

// ─── Task CRUD ─────────────────────────────────────────────────────────

export async function createTask(title, options = {}) {
  const { octokit, owner, repo } = getOctokit();

  const {
    priority = 'medium',
    status = 'todo',
    due_date = null,
    assignee = null,
    sprint_id = null,
    description = '',
    my_day = false,
    estimated_hours = 0,
    tags = [],
    parent_task = null,
  } = options;

  const labels = [
    STATUS_LABELS[status],
    PRIORITY_LABELS[priority],
  ].filter(Boolean);

  const meta = { priority, due_date, estimated_hours, actual_hours: 0, tags, my_day, parent_task };
  const body = buildYamlFrontMatter(meta, description);

  const params = {
    owner, repo, title, body, labels,
  };
  if (assignee) params.assignees = [assignee];
  if (sprint_id) params.milestone = sprint_id;

  const { data } = await octokit.issues.create(params);
  return issueToTask(data);
}

export async function getTask(taskId) {
  const { octokit, owner, repo } = getOctokit();
  const { data } = await octokit.issues.get({ owner, repo, issue_number: taskId });
  return issueToTask(data);
}

export async function updateTask(taskId, updates) {
  const { octokit, owner, repo } = getOctokit();

  // Get current issue
  const { data: current } = await octokit.issues.get({ owner, repo, issue_number: taskId });
  const { meta, description } = parseYamlFrontMatter(current.body);

  // Build updated labels
  let currentLabels = current.labels.map(l => l.name);

  // Update status label
  if (updates.status) {
    currentLabels = currentLabels.filter(l => !Object.values(STATUS_LABELS).includes(l));
    currentLabels.push(STATUS_LABELS[updates.status]);
  }

  // Update priority label
  if (updates.priority) {
    currentLabels = currentLabels.filter(l => !Object.values(PRIORITY_LABELS).includes(l));
    currentLabels.push(PRIORITY_LABELS[updates.priority]);
    meta.priority = updates.priority;
  }

  // Update meta
  if (updates.due_date !== undefined) meta.due_date = updates.due_date;
  if (updates.my_day !== undefined) meta.my_day = updates.my_day;
  if (updates.estimated_hours !== undefined) meta.estimated_hours = updates.estimated_hours;
  if (updates.actual_hours !== undefined) meta.actual_hours = updates.actual_hours;
  if (updates.tags) meta.tags = updates.tags;
  if (updates.parent_task !== undefined) meta.parent_task = updates.parent_task;

  const body = buildYamlFrontMatter(meta, updates.description ?? description);

  const params = {
    owner, repo, issue_number: taskId,
    title: updates.title || current.title,
    body,
    labels: currentLabels,
  };

  if (updates.status === 'done') {
    params.state = 'closed';
    params.state_reason = 'completed';
  } else if (updates.status && updates.status !== 'done' && current.state === 'closed') {
    params.state = 'open';
  }

  if (updates.assignee !== undefined) {
    params.assignees = updates.assignee ? [updates.assignee] : [];
  }
  if (updates.sprint_id !== undefined) {
    params.milestone = updates.sprint_id;
  }

  const { data } = await octokit.issues.update(params);
  return issueToTask(data);
}

export async function listTasks(filters = {}) {
  const { octokit, owner, repo } = getOctokit();

  const params = {
    owner, repo,
    per_page: 100,
    state: filters.status === 'done' ? 'closed' : (filters.include_done ? 'all' : 'open'),
  };

  if (filters.sprint_id) params.milestone = filters.sprint_id;
  if (filters.assignee) params.assignee = filters.assignee;

  const labels = [];
  if (filters.status && filters.status !== 'done') labels.push(STATUS_LABELS[filters.status]);
  if (filters.priority) labels.push(PRIORITY_LABELS[filters.priority]);
  if (labels.length) params.labels = labels.join(',');

  const { data } = await octokit.issues.listForRepo(params);

  // Filter to only TaskPlanner issues (have tp: labels)
  let tasks = data
    .filter(issue => !issue.pull_request)
    .filter(issue => issue.labels.some(l => l.name.startsWith('tp:')))
    .map(issueToTask);

  // Filter by my_day
  if (filters.my_day) {
    tasks = tasks.filter(t => t.my_day);
  }

  // Sort by priority then due date
  tasks.sort((a, b) => {
    const pa = PRIORITY_ORDER[a.priority] ?? 3;
    const pb = PRIORITY_ORDER[b.priority] ?? 3;
    if (pa !== pb) return pa - pb;
    if (a.due_date && b.due_date) return a.due_date.localeCompare(b.due_date);
    if (a.due_date) return -1;
    if (b.due_date) return 1;
    return 0;
  });

  return tasks;
}

export async function deleteTask(taskId) {
  const { octokit, owner, repo } = getOctokit();
  await octokit.issues.update({
    owner, repo, issue_number: taskId,
    state: 'closed',
    state_reason: 'not_planned',
  });
}

// ─── Sprint (Milestone) Management ─────────────────────────────────────

export async function createSprint(title, options = {}) {
  const { octokit, owner, repo } = getOctokit();

  const params = { owner, repo, title };
  if (options.description) params.description = options.description;
  if (options.due_date) params.due_on = new Date(options.due_date).toISOString();

  const { data } = await octokit.issues.createMilestone(params);
  return {
    id: data.number,
    title: data.title,
    description: data.description || '',
    due_on: data.due_on,
    state: data.state,
    open_issues: data.open_issues,
    closed_issues: data.closed_issues,
    created_at: data.created_at,
  };
}

export async function listSprints(state = 'open') {
  const { octokit, owner, repo } = getOctokit();
  const { data } = await octokit.issues.listMilestones({
    owner, repo, state, sort: 'due_on', direction: 'desc',
  });

  return data.map(m => ({
    id: m.number,
    title: m.title,
    description: m.description || '',
    due_on: m.due_on,
    state: m.state,
    open_issues: m.open_issues,
    closed_issues: m.closed_issues,
    created_at: m.created_at,
  }));
}

export async function closeSprint(sprintId) {
  const { octokit, owner, repo } = getOctokit();
  const { data } = await octokit.issues.updateMilestone({
    owner, repo, milestone_number: sprintId, state: 'closed',
  });
  return {
    id: data.number,
    title: data.title,
    state: data.state,
  };
}

// ─── Board Data (Kanban) ───────────────────────────────────────────────

export async function getBoardData(filters = {}) {
  const tasks = await listTasks({ ...filters, include_done: true });

  const columns = {
    'todo': { title: 'To Do', tasks: [], color: '#0075ca' },
    'in-progress': { title: 'In Progress', tasks: [], color: '#fbca04' },
    'blocked': { title: 'Blocked', tasks: [], color: '#d73a4a' },
    'done': { title: 'Done', tasks: [], color: '#0e8a16' },
  };

  for (const task of tasks) {
    if (columns[task.status]) {
      columns[task.status].tasks.push(task);
    }
  }

  return columns;
}

// ─── Analytics ─────────────────────────────────────────────────────────

export async function getAnalytics(sprintId) {
  const filters = sprintId ? { sprint_id: sprintId, include_done: true } : { include_done: true };
  const tasks = await listTasks(filters);

  const statusCounts = { todo: 0, 'in-progress': 0, done: 0, blocked: 0 };
  const priorityCounts = { urgent: 0, high: 0, medium: 0, low: 0 };
  const assigneeCounts = {};
  let overdue = 0;
  const today = new Date().toISOString().split('T')[0];

  for (const task of tasks) {
    statusCounts[task.status] = (statusCounts[task.status] || 0) + 1;
    priorityCounts[task.priority] = (priorityCounts[task.priority] || 0) + 1;

    const assignee = task.assignee || 'Unassigned';
    assigneeCounts[assignee] = (assigneeCounts[assignee] || 0) + 1;

    if (task.due_date && task.due_date < today && task.status !== 'done') {
      overdue++;
    }
  }

  const total = tasks.length;
  const completed = statusCounts.done;
  const completionRate = total ? Math.round((completed / total) * 100) : 0;

  return {
    total,
    completed,
    completionRate,
    overdue,
    statusCounts,
    priorityCounts,
    assigneeCounts,
    tasks,
  };
}

// ─── My Day ────────────────────────────────────────────────────────────

export async function getMyDayTasks() {
  const tasks = await listTasks();
  const today = new Date().toISOString().split('T')[0];

  // Get tasks explicitly added to My Day
  const myDayTasks = tasks.filter(t => t.my_day && t.status !== 'done');

  // Also include tasks due today
  const dueToday = tasks.filter(t => t.due_date === today && t.status !== 'done' && !t.my_day);

  // Also include overdue tasks
  const overdueTasks = tasks.filter(t =>
    t.due_date && t.due_date < today && t.status !== 'done' && !t.my_day
  );

  // Also include in-progress tasks
  const inProgress = tasks.filter(t =>
    t.status === 'in-progress' && !t.my_day && t.due_date !== today
  );

  return {
    my_day: myDayTasks,
    due_today: dueToday,
    overdue: overdueTasks,
    in_progress: inProgress,
    total_focus: myDayTasks.length + dueToday.length + overdueTasks.length,
  };
}

export async function toggleMyDay(taskId, value) {
  return updateTask(taskId, { my_day: value });
}
