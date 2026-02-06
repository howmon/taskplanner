/**
 * TaskPlanner Type Definitions (JSDoc)
 *
 * @typedef {Object} TaskMeta
 * @property {'urgent'|'high'|'medium'|'low'} priority
 * @property {string|null} due_date
 * @property {number} estimated_hours
 * @property {number} actual_hours
 * @property {string[]} tags
 * @property {boolean} my_day
 * @property {number|null} parent_task
 *
 * @typedef {Object} Task
 * @property {number} id - GitHub Issue number
 * @property {string} title
 * @property {string} body - Description (without YAML front-matter)
 * @property {'todo'|'in-progress'|'done'|'blocked'} status
 * @property {'urgent'|'high'|'medium'|'low'} priority
 * @property {string|null} due_date
 * @property {string[]} labels
 * @property {string|null} assignee
 * @property {number|null} sprint_id - Milestone number
 * @property {string|null} sprint_name
 * @property {boolean} my_day
 * @property {number} estimated_hours
 * @property {string} created_at
 * @property {string} updated_at
 * @property {string} html_url
 *
 * @typedef {Object} Sprint
 * @property {number} id - Milestone number
 * @property {string} title
 * @property {string} description
 * @property {string|null} due_on
 * @property {'open'|'closed'} state
 * @property {number} open_issues
 * @property {number} closed_issues
 * @property {string} created_at
 *
 * @typedef {Object} Config
 * @property {string} owner
 * @property {string} repo
 * @property {string} token
 * @property {number} port
 * @property {boolean} notify_enabled
 * @property {string} notify_morning_time
 * @property {string|null} openai_api_key
 */

export const STATUS_LABELS = {
  'todo': 'tp:todo',
  'in-progress': 'tp:in-progress',
  'done': 'tp:done',
  'blocked': 'tp:blocked',
};

export const PRIORITY_LABELS = {
  'urgent': 'tp:urgent',
  'high': 'tp:high',
  'medium': 'tp:medium',
  'low': 'tp:low',
};

export const LABEL_COLORS = {
  'tp:todo': '0075ca',
  'tp:in-progress': 'fbca04',
  'tp:done': '0e8a16',
  'tp:blocked': 'd73a4a',
  'tp:urgent': 'b60205',
  'tp:high': 'd93f0b',
  'tp:medium': 'fbca04',
  'tp:low': '0e8a16',
};

export const LABEL_DESCRIPTIONS = {
  'tp:todo': 'Task is in backlog / to do',
  'tp:in-progress': 'Task is currently being worked on',
  'tp:done': 'Task is completed',
  'tp:blocked': 'Task is blocked',
  'tp:urgent': 'Urgent priority',
  'tp:high': 'High priority',
  'tp:medium': 'Medium priority',
  'tp:low': 'Low priority',
};

export const PRIORITY_ORDER = { 'urgent': 0, 'high': 1, 'medium': 2, 'low': 3 };

export const STATUS_ORDER = { 'blocked': 0, 'in-progress': 1, 'todo': 2, 'done': 3 };
