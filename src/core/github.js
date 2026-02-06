/**
 * TaskPlanner — GitHub Integration via gh CLI
 *
 * All GitHub operations use the `gh` CLI installed on the system.
 * Authentication, rate-limiting, and repo detection are handled by gh.
 *
 * Simple reads  → gh issue list/view  (fast, purpose-built)
 * Complex writes → gh api             (full REST control)
 * Labels        → gh label create     (with --force for idempotency)
 */

import { gh, ghJson, ghApi, getRepoInfo, getRepoSlug, ISSUE_FIELDS } from './ghcli.js';
import {
  STATUS_LABELS, PRIORITY_LABELS,
  LABEL_COLORS, LABEL_DESCRIPTIONS,
  PRIORITY_ORDER,
} from '../types/index.js';

// ─── YAML Front-Matter ─────────────────────────────────────────────────

function parseYamlFrontMatter(body) {
  if (!body) return { meta: {}, description: '' };
  const match = body.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/);
  if (!match) return { meta: {}, description: body };

  const meta = {};
  const lines = match[1].split('\n');
  for (const line of lines) {
    const idx = line.indexOf(':');
    if (idx === -1) continue;
    const key = line.slice(0, idx).trim();
    let value = line.slice(idx + 1).trim();
    if (value === 'true') value = true;
    else if (value === 'false') value = false;
    else if (value === 'null' || value === '') value = null;
    else if (!isNaN(value) && value !== '') value = Number(value);
    meta[key] = value;
  }
  return { meta, description: match[2].trim() };
}

function buildYamlFrontMatter(meta, description) {
  const lines = ['---'];
  for (const [key, value] of Object.entries(meta)) {
    if (Array.isArray(value)) {
      lines.push(`${key}: ${value.join(', ')}`);
    } else {
      lines.push(`${key}: ${value}`);
    }
  }
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
  const body = issue.body || '';
  const { meta, description } = parseYamlFrontMatter(body);

  // Normalize labels — handles both gh CLI JSON and REST API formats
  const labels = (issue.labels || []).map(l => typeof l === 'string' ? { name: l } : l);

  return {
    id: issue.number,
    title: issue.title,
    body: description,
    status: getStatusFromLabels(labels),
    priority: getPriorityFromLabels(labels) || meta.priority || 'medium',
    due_date: meta.due_date || null,
    labels: getUserLabels(labels),
    // gh CLI → assignees[]; REST API → assignee + assignees
    assignee: issue.assignees?.[0]?.login || issue.assignee?.login || null,
    sprint_id: issue.milestone?.number || null,
    sprint_name: issue.milestone?.title || null,
    my_day: meta.my_day || false,
    estimated_hours: meta.estimated_hours || 0,
    actual_hours: meta.actual_hours || 0,
    tags: meta.tags || [],
    parent_task: meta.parent_task || null,
    // gh CLI → camelCase; REST API → snake_case
    created_at: issue.createdAt || issue.created_at || '',
    updated_at: issue.updatedAt || issue.updated_at || '',
    // REST API: html_url = browser link, url = API link
    // gh CLI:   url = browser link
    html_url: issue.html_url || issue.url || '',
  };
}

// ─── Initialization ────────────────────────────────────────────────────

export async function initializeRepo() {
  const slug = getRepoSlug();
  const allLabels = { ...STATUS_LABELS, ...PRIORITY_LABELS };
  const created = [];

  for (const [key, labelName] of Object.entries(allLabels)) {
    try {
      gh('label', 'create', labelName,
        '--color', LABEL_COLORS[labelName] || 'ededed',
        '--description', LABEL_DESCRIPTIONS[labelName] || '',
        '--force',
        '-R', slug
      );
      created.push(labelName);
    } catch {
      // --force handles updates; ignore rare failures
    }
  }

  // Get existing tp: labels
  const labels = ghJson('label', 'list', '--json', 'name', '-R', slug) || [];
  const existing = labels.map(l => l.name).filter(n => n.startsWith('tp:'));

  return { created, existing };
}

// ─── Task CRUD ─────────────────────────────────────────────────────────

export async function createTask(title, options = {}) {
  const { owner, repo } = getRepoInfo();

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

  // gh api supports full JSON payloads (arrays for labels/assignees)
  const payload = { title, body, labels };
  if (assignee) payload.assignees = [assignee];
  if (sprint_id) payload.milestone = sprint_id;

  const data = ghApi(`repos/${owner}/${repo}/issues`, {
    method: 'POST',
    input: payload,
  });

  return issueToTask(data);
}

export async function getTask(taskId) {
  const slug = getRepoSlug();
  const data = ghJson('issue', 'view', String(taskId),
    '--json', ISSUE_FIELDS, '-R', slug);
  return issueToTask(data);
}

export async function updateTask(taskId, updates) {
  const { owner, repo } = getRepoInfo();
  const slug = `${owner}/${repo}`;

  // 1. Read current issue via gh CLI
  const current = ghJson('issue', 'view', String(taskId),
    '--json', ISSUE_FIELDS, '-R', slug);

  const { meta, description } = parseYamlFrontMatter(current.body || '');

  // 2. Compute updated labels
  let currentLabels = (current.labels || []).map(l => l.name);

  if (updates.status) {
    currentLabels = currentLabels.filter(l => !Object.values(STATUS_LABELS).includes(l));
    currentLabels.push(STATUS_LABELS[updates.status]);
  }

  if (updates.priority) {
    currentLabels = currentLabels.filter(l => !Object.values(PRIORITY_LABELS).includes(l));
    currentLabels.push(PRIORITY_LABELS[updates.priority]);
    meta.priority = updates.priority;
  }

  // 3. Update metadata
  if (updates.due_date !== undefined) meta.due_date = updates.due_date;
  if (updates.my_day !== undefined) meta.my_day = updates.my_day;
  if (updates.estimated_hours !== undefined) meta.estimated_hours = updates.estimated_hours;
  if (updates.actual_hours !== undefined) meta.actual_hours = updates.actual_hours;
  if (updates.tags) meta.tags = updates.tags;
  if (updates.parent_task !== undefined) meta.parent_task = updates.parent_task;

  const body = buildYamlFrontMatter(meta, updates.description ?? description);

  // 4. Build API payload
  const payload = {
    title: updates.title || current.title,
    body,
    labels: currentLabels,
  };

  if (updates.status === 'done') {
    payload.state = 'closed';
    payload.state_reason = 'completed';
  } else if (updates.status && updates.status !== 'done' && current.state === 'closed') {
    payload.state = 'open';
  }

  if (updates.assignee !== undefined) {
    payload.assignees = updates.assignee ? [updates.assignee] : [];
  }
  if (updates.sprint_id !== undefined) {
    payload.milestone = updates.sprint_id;
  }

  // 5. PATCH via gh api (handles labels as arrays, state changes, etc.)
  const data = ghApi(`repos/${owner}/${repo}/issues/${taskId}`, {
    method: 'PATCH',
    input: payload,
  });

  return issueToTask(data);
}

export async function listTasks(filters = {}) {
  const slug = getRepoSlug();

  const args = ['issue', 'list',
    '--json', ISSUE_FIELDS,
    '--limit', '100',
    '-R', slug,
  ];

  // State filter
  if (filters.status === 'done') {
    args.push('--state', 'closed');
  } else if (filters.include_done) {
    args.push('--state', 'all');
  } else {
    args.push('--state', 'open');
  }

  // Label filters
  if (filters.status && filters.status !== 'done') {
    args.push('--label', STATUS_LABELS[filters.status]);
  }
  if (filters.priority) {
    args.push('--label', PRIORITY_LABELS[filters.priority]);
  }

  // Assignee filter
  if (filters.assignee) {
    args.push('--assignee', filters.assignee);
  }

  // Sprint/milestone filter — gh uses milestone title, so we look it up
  if (filters.sprint_id) {
    try {
      const { owner, repo } = getRepoInfo();
      const milestone = ghApi(`repos/${owner}/${repo}/milestones/${filters.sprint_id}`);
      if (milestone?.title) {
        args.push('--milestone', milestone.title);
      }
    } catch {
      // Milestone not found, skip filter
    }
  }

  const issues = ghJson(...args) || [];

  // Filter to only TaskPlanner issues (have tp: labels)
  let tasks = issues
    .filter(issue => issue.labels?.some(l => l.name?.startsWith('tp:')))
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
  const slug = getRepoSlug();
  gh('issue', 'close', String(taskId), '--reason', 'not planned', '-R', slug);
}

// ─── Sprint (Milestone) Management ─────────────────────────────────────

export async function createSprint(title, options = {}) {
  const { owner, repo } = getRepoInfo();

  const payload = { title };
  if (options.description) payload.description = options.description;
  if (options.due_date) payload.due_on = new Date(options.due_date).toISOString();

  const data = ghApi(`repos/${owner}/${repo}/milestones`, {
    method: 'POST',
    input: payload,
  });

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
  const { owner, repo } = getRepoInfo();
  const data = ghApi(`repos/${owner}/${repo}/milestones?state=${state}&sort=due_on&direction=desc`);

  if (!Array.isArray(data)) return [];

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
  const { owner, repo } = getRepoInfo();

  const data = ghApi(`repos/${owner}/${repo}/milestones/${sprintId}`, {
    method: 'PATCH',
    input: { state: 'closed' },
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

  const myDayTasks = tasks.filter(t => t.my_day && t.status !== 'done');
  const dueToday = tasks.filter(t => t.due_date === today && t.status !== 'done' && !t.my_day);
  const overdueTasks = tasks.filter(t =>
    t.due_date && t.due_date < today && t.status !== 'done' && !t.my_day
  );
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
