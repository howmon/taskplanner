# 🧠 TaskPlanner — AI-Powered Task Management

> A smart task planner that uses **GitHub Issues as the backend**, provides a beautiful **web UI** with Kanban boards, sprint management, analytics — plus a powerful **CLI** and **macOS system notifications**.

**Inspired by Microsoft Planner** • Built with GitHub CLI & Octokit SDK

---

## ✨ Features

| Feature | Description |
|---|---|
| 📋 **Kanban Board** | Drag-free board with To Do → In Progress → Done columns |
| ☀️ **My Day** | AI-curated daily focus view with overdue, due today, and in-progress tasks |
| 🏃 **Sprint Management** | Create sprints (GitHub Milestones), track progress with burndown |
| 📊 **Analytics** | Completion rate, status/priority distribution, assignee workload |
| 🧠 **AI Planning** | Smart daily planning, task decomposition, priority suggestions |
| 🔔 **Notifications** | macOS system notifications for morning briefing & overdue alerts |
| ⌨️ **CLI** | Full terminal interface for all operations |
| 🌐 **Web UI** | Beautiful local web app with dark/light themes |
| 🐙 **GitHub Native** | Tasks = Issues, Sprints = Milestones, everything syncs with GitHub |

## 🚀 Quick Start

```bash
# Install dependencies
npm install

# Link CLI globally
npm link

# Initialize (creates labels on your GitHub repo)
tp init

# Add your first task
tp add "Build amazing feature" -p high -d 2026-02-10 --my-day

# View your day
tp today

# Launch web UI
tp serve
# Open http://localhost:3847
```

## 📖 CLI Commands

```bash
tp init                         # Set up repo labels
tp add "Title" [options]        # Create a task
tp list [--status] [--priority] # List tasks
tp today                        # My Day view
tp board                        # Kanban board
tp move <id> <status>           # Move task (todo/in-progress/done/blocked)
tp assign <id> <user>           # Assign to GitHub user
tp priority <id> <level>        # Set priority (urgent/high/medium/low)
tp myday <id>                   # Toggle My Day
tp plan                         # AI daily planning
tp decompose <id>               # AI task decomposition
tp sprint list                  # List sprints
tp sprint create "Name" [-d]    # Create sprint
tp sprint current               # Show current sprint
tp sprint close <id>            # Close sprint
tp stats                        # Analytics
tp notify [--morning|--test]    # Send notifications
tp serve [-p port]              # Launch web UI
```

### Task Options
```bash
tp add "Title" \
  -p high \              # Priority: urgent, high, medium, low
  -s in-progress \       # Status: todo, in-progress
  -d 2026-02-10 \        # Due date
  -a username \           # Assign to user
  -m 1 \                 # Sprint (milestone number)
  -e 4 \                 # Estimated hours
  --my-day \             # Add to My Day
  --desc "Details..."    # Description
```

## 🌐 Web UI

Launch with `tp serve` and open http://localhost:3847

**Views:**
- **My Day** — Today's focused tasks with overdue alerts
- **Board** — Kanban columns with quick-move buttons
- **All Tasks** — Filterable list with status/priority/sprint filters
- **Sprints** — Sprint cards with progress bars and task lists
- **Analytics** — Charts for completion rate, distribution, workload

**Keyboard Shortcuts:**
- `Cmd+N` — New task
- `Esc` — Close panels

## 🤖 AI Features (Optional)

Set your OpenAI API key to enable AI features:

```bash
echo "OPENAI_API_KEY=sk-..." > .env
```

- **`tp plan`** — AI analyzes your tasks and suggests a focused daily plan
- **`tp decompose <id>`** — AI breaks down a large task into actionable subtasks
- **Priority Suggestions** — AI recommends priority based on context
- **Description Generation** — AI writes detailed descriptions from titles

Without an API key, the planner uses smart priority-based algorithms.

## 🔔 Notifications

TaskPlanner sends macOS system notifications:
- **Morning Briefing** — Summary of today's tasks
- **Overdue Alerts** — Reminders for past-due tasks

```bash
tp notify              # Send morning briefing now
tp notify --test       # Test notification
tp notify --overdue    # Send overdue alert
```

Notifications also run automatically when the web server is active.

## 📐 Architecture

```
GitHub Issues  →  Tasks
GitHub Labels  →  Status (tp:todo, tp:in-progress, tp:done, tp:blocked)
                  Priority (tp:urgent, tp:high, tp:medium, tp:low)
GitHub Milestones → Sprints
```

```
src/
├── cli/index.js           # CLI with Commander.js
├── core/
│   ├── github.js          # Octokit API integration
│   ├── ai.js              # OpenAI-powered features
│   ├── notifications.js   # System notifications
│   └── config.js          # Configuration management
├── web/
│   ├── server.js          # Express API server
│   └── public/            # Web frontend
│       ├── index.html
│       ├── styles.css
│       └── app.js
└── types/index.js         # Constants & type definitions
```

## 📋 License

MIT
