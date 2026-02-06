import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';
import dotenv from 'dotenv';

const CONFIG_DIR = path.join(process.env.HOME || '~', '.taskplanner');
const CONFIG_FILE = path.join(CONFIG_DIR, 'config.json');

// Load .env from current directory if present
dotenv.config();

/**
 * Get GitHub config from gh CLI, env vars, or config file
 */
export function getConfig() {
  // Try config file first
  let fileConfig = {};
  if (fs.existsSync(CONFIG_FILE)) {
    try {
      fileConfig = JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf-8'));
    } catch { /* ignore */ }
  }

  // Try getting repo info from gh CLI
  let ghOwner = process.env.GITHUB_OWNER || fileConfig.owner || '';
  let ghRepo = process.env.GITHUB_REPO || fileConfig.repo || '';
  let ghToken = process.env.GITHUB_TOKEN || fileConfig.token || '';

  if (!ghOwner || !ghRepo) {
    try {
      const repoInfo = execSync('gh repo view --json owner,name 2>/dev/null', { encoding: 'utf-8' });
      const parsed = JSON.parse(repoInfo);
      ghOwner = ghOwner || parsed.owner?.login;
      ghRepo = ghRepo || parsed.name;
    } catch {
      // Not in a GitHub repo or gh not authenticated
    }
  }

  if (!ghToken) {
    try {
      ghToken = execSync('gh auth token 2>/dev/null', { encoding: 'utf-8' }).trim();
    } catch {
      // gh not authenticated
    }
  }

  return {
    owner: ghOwner,
    repo: ghRepo,
    token: ghToken,
    port: parseInt(process.env.PORT || fileConfig.port || '3847', 10),
    notify_enabled: (process.env.NOTIFY_ENABLED || fileConfig.notify_enabled || 'true') === 'true',
    notify_morning_time: process.env.NOTIFY_MORNING_TIME || fileConfig.notify_morning_time || '09:00',
    openai_api_key: process.env.OPENAI_API_KEY || fileConfig.openai_api_key || null,
  };
}

/**
 * Save config to ~/.taskplanner/config.json
 */
export function saveConfig(config) {
  if (!fs.existsSync(CONFIG_DIR)) {
    fs.mkdirSync(CONFIG_DIR, { recursive: true });
  }
  fs.writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2));
}

/**
 * Validate config has required fields
 */
export function validateConfig(config) {
  const errors = [];
  if (!config.owner) errors.push('GitHub owner not set. Run `tp init` or set GITHUB_OWNER.');
  if (!config.repo) errors.push('GitHub repo not set. Run `tp init` or set GITHUB_REPO.');
  if (!config.token) errors.push('GitHub token not found. Run `gh auth login` first.');
  return errors;
}
