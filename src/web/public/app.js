// ─── State ──────────────────────────────────────────────────────────────
let currentView = 'myday';
let sprints = [];
let appConfig = {};

// ─── API Helper ─────────────────────────────────────────────────────────
async function api(path, options = {}) {
  const { method = 'GET', body } = options;
  const opts = { method, headers: {} };
  if (body) {
    opts.headers['Content-Type'] = 'application/json';
    opts.body = JSON.stringify(body);
  }
  const res = await fetch(`/api${path}`, opts);
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'API error');
  return data;
}

// ─── Init ───────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', async () => {
  setDateHeader();
  await loadInitialData();
  loadMyDay();
});

function setDateHeader() {
  document.getElementById('header-date').textContent =
    new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
}

async function loadInitialData() {
  try {
    appConfig = await api('/health');
    const aiText = document.getElementById('ai-status-text');
    aiText.textContent = appConfig.ai_enabled ? 'AI Enabled' : 'AI Off';

    const repoLink = document.getElementById('repo-link');
    repoLink.href = `https://github.com/${appConfig.repo}`;
    repoLink.title = appConfig.repo;

    sprints = await api('/sprints');
    populateSprintSelects();
  } catch (e) {
    toast('Failed to load config: ' + e.message, 'error');
  }
}

function populateSprintSelects() {
  const selects = ['board-sprint-filter', 'list-sprint-filter', 'task-sprint'];
  for (const id of selects) {
    const el = document.getElementById(id);
    if (!el) continue;
    const firstOpt = el.querySelector('option');
    el.innerHTML = '';
    el.appendChild(firstOpt);
    for (const s of sprints) {
      const opt = document.createElement('option');
      opt.value = s.id;
      opt.textContent = s.title;
      el.appendChild(opt);
    }
  }
}

// ─── View Switching ─────────────────────────────────────────────────────
function switchView(view) {
  currentView = view;

  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
  document.querySelector(`[data-view="${view}"]`).classList.add('active');

  document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
  document.getElementById(`view-${view}`).classList.add('active');

  const titles = { myday: 'My Day', board: 'Board', list: 'All Tasks', sprints: 'Sprints', analytics: 'Analytics' };
  document.getElementById('view-title').textContent = titles[view] || view;

  // Load data for the view
  switch (view) {
    case 'myday': loadMyDay(); break;
    case 'board': loadBoard(); break;
    case 'list': loadTaskList(); break;
    case 'sprints': loadSprints(); break;
    case 'analytics': loadAnalytics(); break;
  }
}

function refreshData() {
  switchView(currentView);
  toast('Refreshed!', 'success');
}

// ─── My Day ─────────────────────────────────────────────────────────────
async function loadMyDay() {
  try {
    const data = await api('/myday');
    const prioIcons = { urgent: '🔴', high: '🟠', medium: '🟡', low: '🟢' };

    const renderSection = (id, title, tasks) => {
      const container = document.getElementById(id);
      if (!tasks.length) { container.innerHTML = ''; return; }
      container.innerHTML = `
        <div class="myday-section-title">${title} (${tasks.length})</div>
        ${tasks.map(t => taskCard(t)).join('')}
      `;
    };

    renderSection('myday-overdue', '⚠️ Overdue', data.overdue);
    renderSection('myday-today', '📅 Due Today', data.due_today);
    renderSection('myday-progress', '🔄 In Progress', data.in_progress);
    renderSection('myday-focus', '⭐ My Day', data.my_day);

    const emptyEl = document.getElementById('myday-empty');
    emptyEl.style.display = data.total_focus === 0 ? 'block' : 'none';

    document.getElementById('myday-badge').textContent = data.total_focus || '';
  } catch (e) {
    toast('Failed to load My Day: ' + e.message, 'error');
  }
}

function taskCard(task) {
  const prioIcons = { urgent: '🔴', high: '🟠', medium: '🟡', low: '🟢' };
  const today = new Date().toISOString().split('T')[0];
  const isOverdue = task.due_date && task.due_date < today && task.status !== 'done';

  return `
    <div class="task-card" onclick="openTaskDetail(${task.id})">
      <div class="task-card-priority ${task.priority}"></div>
      <div class="task-card-body">
        <div class="task-card-title">${escHtml(task.title)}</div>
        <div class="task-card-meta">
          <span class="task-meta-item">#${task.id}</span>
          <span class="task-meta-item">${prioIcons[task.priority] || '⚪'} ${task.priority}</span>
          ${task.due_date ? `<span class="task-meta-item ${isOverdue ? 'overdue' : ''}">📅 ${task.due_date}</span>` : ''}
          ${task.assignee ? `<span class="task-meta-item">👤 ${task.assignee}</span>` : ''}
          ${task.sprint_name ? `<span class="task-meta-item">🏃 ${task.sprint_name}</span>` : ''}
        </div>
      </div>
      <div class="task-card-actions">
        <button class="btn-icon" onclick="event.stopPropagation(); quickMove(${task.id}, 'done')" title="Mark done">✅</button>
        <button class="btn-icon" onclick="event.stopPropagation(); toggleTaskMyDay(${task.id}, ${!task.my_day})" title="Toggle My Day">${task.my_day ? '⭐' : '☆'}</button>
      </div>
    </div>
  `;
}

// ─── Board View ─────────────────────────────────────────────────────────
async function loadBoard() {
  try {
    const sprintFilter = document.getElementById('board-sprint-filter')?.value;
    const params = sprintFilter ? `?sprint_id=${sprintFilter}` : '';
    const board = await api(`/board${params}`);
    const container = document.getElementById('board-container');

    const statusOrder = ['todo', 'in-progress', 'blocked', 'done'];
    const statuses = { todo: 'To Do', 'in-progress': 'In Progress', blocked: 'Blocked', done: 'Done' };
    const allStatuses = Object.keys(statuses);

    container.innerHTML = statusOrder.map(status => {
      const col = board[status] || { tasks: [], title: statuses[status] };
      return `
        <div class="board-column">
          <div class="board-column-header ${status}">
            <span class="board-column-title">${col.title}</span>
            <span class="board-column-count">${col.tasks.length}</span>
          </div>
          <div class="board-column-tasks" data-status="${status}">
            ${col.tasks.map(t => boardCard(t, status, allStatuses)).join('')}
            ${col.tasks.length === 0 ? '<div class="text-muted" style="text-align:center;padding:20px;font-size:13px">No tasks</div>' : ''}
          </div>
        </div>
      `;
    }).join('');
  } catch (e) {
    toast('Failed to load board: ' + e.message, 'error');
  }
}

function boardCard(task, currentStatus, allStatuses) {
  const today = new Date().toISOString().split('T')[0];
  const isOverdue = task.due_date && task.due_date < today && task.status !== 'done';
  const prioIcons = { urgent: '🔴', high: '🟠', medium: '🟡', low: '🟢' };

  const moveTargets = allStatuses.filter(s => s !== currentStatus);
  const moveLabels = { todo: '📥 To Do', 'in-progress': '🔄 Progress', blocked: '🚫 Block', done: '✅ Done' };

  return `
    <div class="board-task-card ${task.priority}" onclick="openTaskDetail(${task.id})">
      <div class="board-task-title">${escHtml(task.title)}</div>
      <div class="board-task-footer">
        <span class="board-task-id">#${task.id}</span>
        <div class="board-task-badges">
          <span class="badge badge-priority">${prioIcons[task.priority]} ${task.priority}</span>
          ${task.due_date ? `<span class="badge badge-due ${isOverdue ? 'overdue' : ''}">${task.due_date}</span>` : ''}
          ${task.assignee ? `<span class="badge badge-assignee">@${task.assignee}</span>` : ''}
        </div>
      </div>
      <div class="board-card-moves">
        ${moveTargets.map(s => `
          <button class="move-btn" onclick="event.stopPropagation(); quickMove(${task.id}, '${s}')">${moveLabels[s]}</button>
        `).join('')}
      </div>
    </div>
  `;
}

// ─── List View ──────────────────────────────────────────────────────────
async function loadTaskList() {
  try {
    const status = document.getElementById('list-status-filter')?.value;
    const priority = document.getElementById('list-priority-filter')?.value;
    const sprint = document.getElementById('list-sprint-filter')?.value;

    const params = new URLSearchParams();
    if (status) params.set('status', status);
    if (priority) params.set('priority', priority);
    if (sprint) params.set('sprint_id', sprint);
    params.set('include_done', status === 'done' ? 'true' : 'false');

    const tasks = await api(`/tasks?${params}`);
    const container = document.getElementById('task-list');

    const statusIcons = { todo: '⬜', 'in-progress': '🔄', done: '✅', blocked: '🚫' };
    const prioIcons = { urgent: '🔴', high: '🟠', medium: '🟡', low: '🟢' };

    container.innerHTML = `
      <div class="task-list-header">
        <div>#</div>
        <div>Title</div>
        <div>Status</div>
        <div>Priority</div>
        <div>Due</div>
        <div>Assignee</div>
        <div>Sprint</div>
      </div>
      ${tasks.map(t => `
        <div class="task-list-row" onclick="openTaskDetail(${t.id})">
          <div class="task-id">#${t.id}</div>
          <div class="task-title-cell">${escHtml(t.title)}</div>
          <div>${statusIcons[t.status] || '⬜'} ${t.status}</div>
          <div>${prioIcons[t.priority] || '⚪'} ${t.priority}</div>
          <div>${t.due_date || '—'}</div>
          <div>${t.assignee || '—'}</div>
          <div>${t.sprint_name || '—'}</div>
        </div>
      `).join('')}
      ${tasks.length === 0 ? '<div style="text-align:center;padding:40px;color:var(--text-tertiary)">No tasks found</div>' : ''}
    `;

    document.getElementById('tasks-badge').textContent = tasks.length || '';
  } catch (e) {
    toast('Failed to load tasks: ' + e.message, 'error');
  }
}

// ─── Sprint View ────────────────────────────────────────────────────────
async function loadSprints() {
  try {
    const sprintsData = await api('/sprints?state=all');
    const container = document.getElementById('sprints-container');

    if (sprintsData.length === 0) {
      container.innerHTML = `
        <div style="text-align:center;padding:60px;color:var(--text-tertiary)">
          <div style="font-size:40px;margin-bottom:16px">🏃</div>
          <h3 style="color:var(--text-primary);margin-bottom:8px">No sprints yet</h3>
          <p>Create your first sprint to organize tasks into time-boxed iterations.</p>
        </div>`;
      return;
    }

    let html = '';
    for (const sprint of sprintsData) {
      const total = sprint.open_issues + sprint.closed_issues;
      const progress = total ? Math.round((sprint.closed_issues / total) * 100) : 0;

      // Load tasks for this sprint
      let tasksHtml = '';
      try {
        const tasks = await api(`/tasks?sprint_id=${sprint.id}&include_done=true`);
        const statusIcons = { todo: '⬜', 'in-progress': '🔄', done: '✅', blocked: '🚫' };
        const prioIcons = { urgent: '🔴', high: '🟠', medium: '🟡', low: '🟢' };

        tasksHtml = tasks.map(t => `
          <div class="task-card" onclick="openTaskDetail(${t.id})" style="margin-bottom:6px">
            <div class="task-card-priority ${t.priority}"></div>
            <div class="task-card-body">
              <div class="task-card-title">${statusIcons[t.status]} ${escHtml(t.title)}</div>
              <div class="task-card-meta">
                <span class="task-meta-item">${prioIcons[t.priority]} ${t.priority}</span>
                ${t.assignee ? `<span class="task-meta-item">👤 ${t.assignee}</span>` : ''}
              </div>
            </div>
          </div>
        `).join('');
      } catch { /* ignore */ }

      html += `
        <div class="sprint-card">
          <div class="sprint-card-header">
            <div>
              <div class="sprint-card-title">${escHtml(sprint.title)}</div>
              <div class="sprint-card-meta">
                <span>${sprint.state === 'open' ? '🟢 Open' : '⚪ Closed'}</span>
                ${sprint.due_on ? `<span>📅 Due: ${new Date(sprint.due_on).toLocaleDateString()}</span>` : ''}
                <span>📊 ${sprint.closed_issues}/${total} tasks</span>
              </div>
            </div>
            ${sprint.state === 'open' ? `<button class="btn btn-sm btn-ghost" onclick="closeSprint(${sprint.id})">Close Sprint</button>` : ''}
          </div>
          <div class="sprint-progress">
            <div style="display:flex;justify-content:space-between;font-size:13px;color:var(--text-secondary)">
              <span>Progress</span>
              <span>${progress}%</span>
            </div>
            <div class="progress-bar">
              <div class="progress-fill" style="width:${progress}%"></div>
            </div>
          </div>
          ${tasksHtml ? `<div class="sprint-tasks">${tasksHtml}</div>` : ''}
        </div>
      `;
    }

    container.innerHTML = html;
  } catch (e) {
    toast('Failed to load sprints: ' + e.message, 'error');
  }
}

// ─── Analytics ──────────────────────────────────────────────────────────
async function loadAnalytics() {
  try {
    const data = await api('/analytics');
    const grid = document.getElementById('analytics-grid');

    const statusColors = { todo: '#0075ca', 'in-progress': '#fbca04', done: '#0e8a16', blocked: '#d73a4a' };
    const prioColors = { urgent: '#f85149', high: '#d29922', medium: '#58a6ff', low: '#3fb950' };

    const maxStatus = Math.max(...Object.values(data.statusCounts), 1);
    const maxPrio = Math.max(...Object.values(data.priorityCounts), 1);

    grid.innerHTML = `
      <div class="analytics-card">
        <div class="analytics-card-title">Completion Rate</div>
        <div class="analytics-big-number ${data.completionRate >= 50 ? 'text-success' : ''}">${data.completionRate}%</div>
        <div class="analytics-subtitle">${data.completed} of ${data.total} tasks completed</div>
      </div>

      <div class="analytics-card">
        <div class="analytics-card-title">Total Tasks</div>
        <div class="analytics-big-number">${data.total}</div>
        <div class="analytics-subtitle">${data.overdue > 0 ? `⚠️ ${data.overdue} overdue` : '✅ No overdue tasks'}</div>
      </div>

      <div class="analytics-card">
        <div class="analytics-card-title">Overdue</div>
        <div class="analytics-big-number ${data.overdue > 0 ? 'text-danger' : 'text-success'}">${data.overdue}</div>
        <div class="analytics-subtitle">task${data.overdue !== 1 ? 's' : ''} past due date</div>
      </div>

      <div class="analytics-card" style="grid-column: span 2">
        <div class="analytics-card-title">By Status</div>
        ${Object.entries(data.statusCounts).map(([s, c]) => `
          <div class="chart-bar-group">
            <div class="chart-bar-label">
              <span>${s}</span>
              <span>${c}</span>
            </div>
            <div class="chart-bar" style="width:${Math.max((c / maxStatus) * 100, 2)}%;background:${statusColors[s]}">${c > 0 ? c : ''}</div>
          </div>
        `).join('')}
      </div>

      <div class="analytics-card">
        <div class="analytics-card-title">By Priority</div>
        ${Object.entries(data.priorityCounts).map(([p, c]) => `
          <div class="chart-bar-group">
            <div class="chart-bar-label">
              <span>${p}</span>
              <span>${c}</span>
            </div>
            <div class="chart-bar" style="width:${Math.max((c / maxPrio) * 100, 2)}%;background:${prioColors[p]}">${c > 0 ? c : ''}</div>
          </div>
        `).join('')}
      </div>

      ${Object.keys(data.assigneeCounts).length > 0 ? `
        <div class="analytics-card">
          <div class="analytics-card-title">By Assignee</div>
          ${Object.entries(data.assigneeCounts).map(([a, c]) => `
            <div class="chart-bar-group">
              <div class="chart-bar-label">
                <span>👤 ${a}</span>
                <span>${c}</span>
              </div>
              <div class="chart-bar" style="width:${Math.max((c / data.total) * 100, 2)}%;background:var(--accent)">${c}</div>
            </div>
          `).join('')}
        </div>
      ` : ''}
    `;
  } catch (e) {
    toast('Failed to load analytics: ' + e.message, 'error');
  }
}

// ─── Task Detail Panel ──────────────────────────────────────────────────
async function openTaskDetail(taskId) {
  try {
    const task = await api(`/tasks/${taskId}`);
    const panel = document.getElementById('slide-panel');
    const body = document.getElementById('panel-body');
    const title = document.getElementById('panel-title');

    title.textContent = `#${task.id} ${task.title}`;

    const statusIcons = { todo: '⬜', 'in-progress': '🔄', done: '✅', blocked: '🚫' };
    const prioIcons = { urgent: '🔴', high: '🟠', medium: '🟡', low: '🟢' };

    body.innerHTML = `
      <div class="detail-actions">
        <button class="btn btn-sm btn-ghost" onclick="quickMove(${task.id}, 'todo')">⬜ To Do</button>
        <button class="btn btn-sm btn-ghost" onclick="quickMove(${task.id}, 'in-progress')">🔄 Progress</button>
        <button class="btn btn-sm btn-ghost" onclick="quickMove(${task.id}, 'done')">✅ Done</button>
        <button class="btn btn-sm btn-ghost" onclick="quickMove(${task.id}, 'blocked')">🚫 Blocked</button>
        <button class="btn btn-sm btn-ghost" onclick="toggleTaskMyDay(${task.id}, ${!task.my_day})">${task.my_day ? '⭐ In My Day' : '☆ Add to My Day'}</button>
      </div>

      <div class="detail-field">
        <label>Status</label>
        <div class="value">${statusIcons[task.status]} ${task.status}</div>
      </div>

      <div class="detail-field">
        <label>Priority</label>
        <div class="value">${prioIcons[task.priority]} ${task.priority}</div>
      </div>

      <div class="detail-field">
        <label>Due Date</label>
        <div class="value">${task.due_date || 'Not set'}</div>
      </div>

      <div class="detail-field">
        <label>Assignee</label>
        <div class="value">${task.assignee ? `@${task.assignee}` : 'Unassigned'}</div>
      </div>

      <div class="detail-field">
        <label>Sprint</label>
        <div class="value">${task.sprint_name || 'None'}</div>
      </div>

      <div class="detail-field">
        <label>Estimated Hours</label>
        <div class="value">${task.estimated_hours || 0}h</div>
      </div>

      ${task.body ? `
        <div class="detail-field">
          <label>Description</label>
          <div class="value" style="white-space:pre-wrap">${escHtml(task.body)}</div>
        </div>
      ` : ''}

      <div class="detail-field">
        <label>Created</label>
        <div class="value">${new Date(task.created_at).toLocaleString()}</div>
      </div>

      <div style="margin-top:24px;padding-top:16px;border-top:1px solid var(--border-light)">
        <a href="${task.html_url}" target="_blank" class="btn btn-ghost btn-sm" style="text-decoration:none">
          🔗 Open in GitHub
        </a>
        <button class="btn btn-sm btn-danger" onclick="deleteTaskAction(${task.id})" style="margin-left:8px">
          🗑️ Delete
        </button>
      </div>
    `;

    panel.classList.add('open');
  } catch (e) {
    toast('Failed to load task: ' + e.message, 'error');
  }
}

function closeSlidePanel() {
  document.getElementById('slide-panel').classList.remove('open');
}

// ─── Quick Actions ──────────────────────────────────────────────────────
async function quickMove(taskId, status) {
  try {
    await api(`/tasks/${taskId}`, { method: 'PATCH', body: { status } });
    toast(`#${taskId} → ${status}`, 'success');
    closeSlidePanel();
    switchView(currentView);
  } catch (e) {
    toast('Failed: ' + e.message, 'error');
  }
}

async function toggleTaskMyDay(taskId, value) {
  try {
    await api(`/myday/${taskId}/toggle`, { method: 'POST', body: { value } });
    toast(value ? `⭐ Added to My Day` : `Removed from My Day`, 'success');
    closeSlidePanel();
    switchView(currentView);
  } catch (e) {
    toast('Failed: ' + e.message, 'error');
  }
}

async function deleteTaskAction(taskId) {
  if (!confirm(`Delete task #${taskId}?`)) return;
  try {
    await api(`/tasks/${taskId}`, { method: 'DELETE' });
    toast(`#${taskId} deleted`, 'success');
    closeSlidePanel();
    switchView(currentView);
  } catch (e) {
    toast('Failed: ' + e.message, 'error');
  }
}

// ─── Create Task ────────────────────────────────────────────────────────
function openAddTask() {
  document.getElementById('add-task-modal').classList.add('open');
  document.getElementById('task-title').focus();
}

async function handleAddTask(e) {
  e.preventDefault();
  const body = {
    title: document.getElementById('task-title').value,
    description: document.getElementById('task-desc').value,
    priority: document.getElementById('task-priority').value,
    status: document.getElementById('task-status').value,
    due_date: document.getElementById('task-due').value || null,
    sprint_id: document.getElementById('task-sprint').value ? parseInt(document.getElementById('task-sprint').value) : null,
    estimated_hours: parseFloat(document.getElementById('task-estimate').value) || 0,
    assignee: document.getElementById('task-assignee').value || null,
    my_day: document.getElementById('task-myday').checked,
  };

  showLoading(true);
  try {
    const task = await api('/tasks', { method: 'POST', body });
    toast(`✅ Task #${task.id} created!`, 'success');
    closeModal('add-task-modal');
    e.target.reset();
    switchView(currentView);
  } catch (err) {
    toast('Failed: ' + err.message, 'error');
  } finally {
    showLoading(false);
  }
}

// ─── Create Sprint ──────────────────────────────────────────────────────
function openCreateSprint() {
  document.getElementById('create-sprint-modal').classList.add('open');
}

async function handleCreateSprint(e) {
  e.preventDefault();
  const body = {
    title: document.getElementById('sprint-name').value,
    description: document.getElementById('sprint-desc').value,
    due_date: document.getElementById('sprint-due').value || null,
  };

  showLoading(true);
  try {
    const sprint = await api('/sprints', { method: 'POST', body });
    toast(`✅ Sprint "${sprint.title}" created!`, 'success');
    closeModal('create-sprint-modal');
    e.target.reset();
    sprints = await api('/sprints');
    populateSprintSelects();
    loadSprints();
  } catch (err) {
    toast('Failed: ' + err.message, 'error');
  } finally {
    showLoading(false);
  }
}

async function closeSprint(id) {
  if (!confirm('Close this sprint?')) return;
  try {
    await api(`/sprints/${id}/close`, { method: 'POST' });
    toast('Sprint closed!', 'success');
    sprints = await api('/sprints');
    populateSprintSelects();
    loadSprints();
  } catch (e) {
    toast('Failed: ' + e.message, 'error');
  }
}

// ─── AI Plan ────────────────────────────────────────────────────────────
async function aiPlanDay() {
  showLoading(true);
  try {
    const plan = await api('/ai/plan', { method: 'POST' });

    const prioIcons = { urgent: '🔴', high: '🟠', medium: '🟡', low: '🟢' };

    const panel = document.getElementById('slide-panel');
    const body = document.getElementById('panel-body');
    const title = document.getElementById('panel-title');

    title.textContent = '🧠 AI Daily Plan';

    body.innerHTML = `
      <div class="ai-plan-result">
        ${plan.plan.map((item, i) => `
          <div class="ai-plan-item">
            <div class="ai-plan-num">${i + 1}</div>
            <div class="ai-plan-content">
              <div class="ai-plan-task-title">${prioIcons[item.task.priority]} #${item.task.id} ${escHtml(item.task.title)}</div>
              <div class="ai-plan-reason">${escHtml(item.reason)}</div>
            </div>
          </div>
        `).join('')}
        <div class="ai-plan-summary">
          <strong>📝 Summary:</strong> ${escHtml(plan.summary)}
          ${plan.tip ? `<br><strong>💡 Tip:</strong> ${escHtml(plan.tip)}` : ''}
        </div>
      </div>
    `;

    panel.classList.add('open');
  } catch (e) {
    toast('AI Plan failed: ' + e.message, 'error');
  } finally {
    showLoading(false);
  }
}

// ─── Utilities ──────────────────────────────────────────────────────────
function closeModal(id) {
  document.getElementById(id).classList.remove('open');
}

function escHtml(str) {
  if (!str) return '';
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

function toast(message, type = 'success') {
  const container = document.getElementById('toast-container');
  const el = document.createElement('div');
  el.className = `toast ${type}`;
  el.textContent = message;
  container.appendChild(el);
  setTimeout(() => el.remove(), 3000);
}

function showLoading(show) {
  document.getElementById('loading-overlay').classList.toggle('show', show);
}

function toggleTheme() {
  const html = document.documentElement;
  const current = html.getAttribute('data-theme');
  html.setAttribute('data-theme', current === 'dark' ? 'light' : 'dark');
}

// ─── Keyboard Shortcuts ─────────────────────────────────────────────────
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    closeSlidePanel();
    closeModal('add-task-modal');
    closeModal('create-sprint-modal');
  }
  if (e.key === 'n' && (e.metaKey || e.ctrlKey)) {
    e.preventDefault();
    openAddTask();
  }
});
