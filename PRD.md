# AI-Powered Task Planner — Product Requirements Document

**Version:** 1.0  
**Date:** February 6, 2026  
**Author:** TaskPlanner Team  

---

## 1. Executive Summary

TaskPlanner is an AI-powered task management application that uses **GitHub Issues as the backend data store** and provides both a beautiful **web-based UI** (inspired by Microsoft Planner) and a powerful **CLI interface** via GitHub CLI (`gh`) and the Octokit SDK. It delivers Kanban boards, sprint planning, daily task views, analytics charts, and **macOS system notifications** — all driven by intelligent AI that helps you plan, prioritize, and stay on track.

---

## 2. Problem Statement

Developers live in GitHub but lack a **unified, intelligent task planner** that:
- Treats GitHub Issues as first-class task objects with rich views
- Provides Kanban/Sprint/Calendar views without leaving the terminal or a lightweight local app
- Sends proactive **system notifications** about today's tasks, deadlines, and overdue items
- Uses **AI to suggest priorities**, decompose goals, and plan your day

---

## 3. Key Inspirations from Microsoft Planner

| MS Planner Feature | TaskPlanner Equivalent |
|---|---|
| My Day | **"My Day"** view — AI-curated focus tasks for today |
| Board View (Buckets) | **Kanban Board** — columns = GitHub Labels (To Do, In Progress, Done) |
| Charts | **Analytics Dashboard** — progress charts, burndown, velocity |
| Sprints | **Sprint View** — GitHub Milestones = Sprints, backlog + sprint board |
| Timeline/Schedule | **Timeline View** — tasks on a Gantt-style timeline by due date |
| Labels & Priority | **Color Labels + Priority Levels** (🔴 Urgent, 🟠 High, 🟡 Medium, 🟢 Low) |
| Task History | **Activity Log** — issue comment history from GitHub |
| Goals | **Goals/Epics** — tracked via GitHub Labels or parent issues |
| People View | **Assignee View** — group tasks by who's assigned |
| Copilot AI | **AI Planner** — OpenAI-powered task decomposition, daily planning, smart prioritization |
| Notifications | **macOS Notifications** — system alerts for tasks due today, overdue, upcoming |
| Custom Fields | **Task Metadata** — stored in issue body as structured YAML front-matter |

---

## 4. Architecture

### 4.1 Data Layer — GitHub as Backend
```
GitHub Issues  →  Tasks
GitHub Labels  →  Status (tp:todo, tp:in-progress, tp:done, tp:blocked)
                  Priority (tp:urgent, tp:high, tp:medium, tp:low)
                  Category (custom user labels)
GitHub Milestones → Sprints (with start/end dates)
Issue Body     →  Task details + structured metadata (YAML front-matter)
Issue Comments →  Activity history & AI notes
```

### 4.2 System Architecture
```
┌─────────────────────────────────────────────────────┐
│                    TaskPlanner                        │
├──────────────┬──────────────────┬────────────────────┤
│   CLI Tool   │   Web UI (local) │  Notification Svc  │
│  (commander) │ (Express + HTML) │  (node-notifier)   │
├──────────────┴──────────────────┴────────────────────┤
│                   Core Engine                         │
│  ┌──────────┐ ┌──────────┐ ┌──────┐ ┌────────────┐  │
│  │ GitHub   │ │  Task    │ │Sprint│ │     AI     │  │
│  │ Service  │ │ Manager  │ │  Mgr │ │  Planner   │  │
│  └──────────┘ └──────────┘ └──────┘ └────────────┘  │
├──────────────────────────────────────────────────────┤
│             GitHub API (Octokit REST)                 │
└──────────────────────────────────────────────────────┘
```

### 4.3 Tech Stack
| Component | Technology |
|---|---|
| Runtime | Node.js 20+ |
| Language | JavaScript (ES Modules) |
| CLI Framework | Commander.js |
| GitHub API | @octokit/rest + `gh` CLI |
| Web Server | Express.js |
| Frontend | Vanilla JS + CSS (no build step) |
| Notifications | node-notifier (macOS native) |
| AI | OpenAI API (optional) |
| Config | dotenv + ~/.taskplanner/config.json |

---

## 5. Feature Specifications

### 5.1 My Day View
- **Morning Briefing**: AI-generated daily plan based on due dates, priorities, and sprint goals
- **Focus Tasks**: Auto-selected top 5 tasks for the day
- **Quick Add**: Rapidly add tasks to today's focus
- **Progress Ring**: Visual completion percentage for the day
- **System Notification**: Morning notification at configured time with day's summary

### 5.2 Kanban Board View
- **Columns**: To Do → In Progress → Done (customizable)
- **Drag & Drop**: Move cards between columns (web UI)
- **Card Display**: Title, priority badge, assignee avatar, due date, labels
- **Filters**: By assignee, label, priority, milestone/sprint
- **Swim Lanes**: Optional grouping by label or assignee
- **WIP Limits**: Configurable max cards per column

### 5.3 Sprint View
- **Sprint Board**: Filtered Kanban showing only current sprint's tasks
- **Backlog**: Unassigned tasks not in any sprint
- **Sprint Planning**: AI suggests which tasks to include based on velocity & priority
- **Burndown Chart**: Track remaining work over sprint duration
- **Sprint Summary**: Stats on completed/remaining/added tasks
- **Sprint CRUD**: Create, start, close sprints (maps to GitHub Milestones)

### 5.4 Analytics & Charts
- **Task Distribution**: Pie chart by status, priority, assignee
- **Burndown**: Line chart of remaining tasks over time
- **Velocity**: Bar chart of tasks completed per sprint
- **Overdue Tracking**: Count and list of overdue tasks
- **Completion Trend**: Tasks completed over last 7/14/30 days

### 5.5 AI-Powered Features
- **Task Decomposition**: "Break down this goal into subtasks" → creates child issues
- **Smart Prioritization**: Suggests priority based on due date, dependencies, workload
- **Daily Planner**: "Plan my day" → AI selects and orders today's tasks
- **Task Description Generator**: Generates detailed task descriptions from brief titles
- **Sprint Planning Assistant**: Recommends sprint scope based on velocity

### 5.6 Notifications
- **Morning Briefing**: Summary of today's tasks (configurable time)
- **Due Soon**: Alert when task is due within configured threshold
- **Overdue Alert**: Notification for overdue tasks
- **Sprint Alerts**: Sprint start/end notifications
- **Custom Reminders**: Per-task reminders

### 5.7 CLI Commands
```bash
tp init                    # Initialize repo for TaskPlanner
tp add "Task title"        # Quick add a task
tp list [--status] [--sprint] [--priority]  # List tasks
tp today                   # Show My Day tasks
tp board                   # Show Kanban board in terminal
tp sprint list             # List sprints
tp sprint create "Name"    # Create new sprint
tp sprint current          # Show current sprint
tp move <id> <status>      # Move task to new status
tp assign <id> <user>      # Assign task
tp priority <id> <level>   # Set priority
tp plan                    # AI daily planning
tp decompose <id>          # AI task decomposition
tp notify                  # Send test notification
tp serve                   # Launch web UI
tp sync                    # Force sync with GitHub
```

---

## 6. Data Model

### 6.1 Task (GitHub Issue)
```yaml
---
# Stored in issue body as YAML front-matter
priority: high          # urgent | high | medium | low
due_date: 2026-02-10
estimated_hours: 4
actual_hours: 0
tags: [frontend, bug]
my_day: true
parent_task: 42         # Parent issue number
---
# Task Description
Detailed description of what needs to be done...
```

### 6.2 Sprint (GitHub Milestone)
```json
{
  "title": "Sprint 1",
  "description": "Sprint goal description",
  "due_on": "2026-02-14T00:00:00Z",
  "state": "open"
}
```

### 6.3 Label Taxonomy
```
tp:todo        → 🔵 To Do
tp:in-progress → 🟡 In Progress  
tp:done        → 🟢 Done
tp:blocked     → 🔴 Blocked
tp:urgent      → 🔴 Urgent Priority
tp:high        → 🟠 High Priority
tp:medium      → 🟡 Medium Priority
tp:low         → 🟢 Low Priority
```

---

## 7. User Flows

### 7.1 First-Time Setup
1. User runs `tp init` in a GitHub repo
2. App creates required labels (tp:todo, tp:in-progress, etc.)
3. App creates config file at `~/.taskplanner/config.json`
4. User optionally sets OpenAI API key for AI features

### 7.2 Daily Workflow
1. Morning: System notification with day's task summary
2. User runs `tp today` or opens web UI → sees My Day view
3. User works through tasks, moving them via `tp move` or drag-drop
4. AI suggests next task when one is completed
5. End of day: Summary notification with completion stats

### 7.3 Sprint Workflow
1. User creates sprint: `tp sprint create "Sprint 3" --start 2026-02-10 --end 2026-02-21`
2. AI suggests tasks for sprint based on backlog priority & velocity
3. User adds/removes tasks from sprint
4. During sprint: burndown chart tracks progress
5. Sprint end: Auto-summary with velocity metrics

---

## 8. Non-Functional Requirements

| Requirement | Target |
|---|---|
| Startup Time | < 2 seconds |
| API Calls | Cached with 60s TTL |
| Offline Mode | Read from cache, queue writes |
| Notification Latency | < 1 second |
| Web UI Load | < 500ms |
| Supported OS | macOS (primary), Linux, Windows |

---

## 9. Success Metrics

- **Adoption**: User can set up and create first task within 2 minutes
- **Productivity**: "My Day" tasks have >70% completion rate
- **Engagement**: User opens app daily (notification drives return)
- **Sprint Velocity**: Measurable improvement in task completion per sprint

---

## 10. Future Enhancements (v2+)

- [ ] Multi-repo support (aggregate tasks from multiple repos)
- [ ] Team dashboard with People View
- [ ] Calendar integration (Google Calendar, Apple Calendar)
- [ ] Mobile companion (push notifications)
- [ ] GitHub Projects v2 integration
- [ ] Task dependencies with critical path
- [ ] Time tracking with Pomodoro timer
- [ ] Custom fields UI builder
- [ ] Webhook-based real-time sync
- [ ] VS Code extension sidebar

---

## 11. Implementation Priority

### Phase 1 (MVP) — This Release
1. ✅ GitHub Issues ↔ Task mapping with labels
2. ✅ CLI commands (add, list, move, today, board)
3. ✅ Kanban Board web view
4. ✅ Sprint management (create, list, assign tasks)
5. ✅ macOS system notifications
6. ✅ My Day view
7. ✅ Basic analytics charts

### Phase 2
1. AI task decomposition & daily planning
2. Burndown & velocity charts
3. Timeline/Gantt view
4. Advanced filters & search
5. Offline mode with sync queue
