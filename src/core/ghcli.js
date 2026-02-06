/**
 * TaskPlanner — gh CLI Wrapper
 * Low-level helpers for calling the GitHub CLI (gh) installed on the system.
 * All GitHub operations go through the authenticated gh binary.
 */

import { spawnSync } from 'child_process';
import { getConfig } from './config.js';

/** JSON fields we request from gh issue list/view */
export const ISSUE_FIELDS = 'number,title,body,state,labels,assignees,milestone,url,createdAt,updatedAt';

// ─── Core Helpers ──────────────────────────────────────────────────────

/**
 * Execute a gh CLI command and return stdout.
 * Arguments are passed as an array (safe from shell injection).
 */
export function gh(...args) {
  const result = spawnSync('gh', args, {
    encoding: 'utf-8',
    maxBuffer: 10 * 1024 * 1024,
    stdio: ['pipe', 'pipe', 'pipe'],
  });

  if (result.error) throw result.error;
  if (result.status !== 0) {
    const msg = result.stderr?.trim() || `gh exited with code ${result.status}`;
    throw new Error(msg);
  }
  return result.stdout.trim();
}

/**
 * Execute a gh CLI command and parse JSON output.
 */
export function ghJson(...args) {
  const output = gh(...args);
  if (!output) return null;
  try {
    return JSON.parse(output);
  } catch {
    return null;
  }
}

/**
 * Call the GitHub REST API through `gh api`.
 * Handles JSON payloads via stdin for complex bodies (arrays, nested objects).
 *
 * @param {string} endpoint  - API path, e.g. 'repos/owner/repo/issues'
 * @param {object} options   - { method, input, fields, rawFields }
 *   input:     object piped as JSON to stdin (for POST/PATCH with arrays)
 *   fields:    { key: value } sent as -f key=value (string fields)
 *   rawFields: { key: value } sent as -F key=value (typed: numbers, booleans, null)
 */
export function ghApi(endpoint, options = {}) {
  const args = ['api', endpoint];

  if (options.method) {
    args.push('--method', options.method);
  }

  const spawnOpts = {
    encoding: 'utf-8',
    maxBuffer: 10 * 1024 * 1024,
    stdio: ['pipe', 'pipe', 'pipe'],
  };

  // Complex JSON payloads → stdin
  if (options.input) {
    args.push('--input', '-');
    spawnOpts.input = JSON.stringify(options.input);
  }

  // Simple string fields
  if (options.fields) {
    for (const [key, val] of Object.entries(options.fields)) {
      if (val !== undefined && val !== null) {
        args.push('-f', `${key}=${val}`);
      }
    }
  }

  // Typed fields (numbers, booleans)
  if (options.rawFields) {
    for (const [key, val] of Object.entries(options.rawFields)) {
      if (val !== undefined && val !== null) {
        args.push('-F', `${key}=${val}`);
      }
    }
  }

  const result = spawnSync('gh', args, spawnOpts);
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(result.stderr?.trim() || 'gh api request failed');
  }

  const output = result.stdout?.trim();
  if (!output) return null;
  try {
    return JSON.parse(output);
  } catch {
    return output; // Return raw string if not JSON
  }
}

// ─── Repo Helpers ──────────────────────────────────────────────────────

/**
 * Get { owner, repo } from config (auto-detected from gh CLI).
 */
export function getRepoInfo() {
  const config = getConfig();
  return { owner: config.owner, repo: config.repo };
}

/**
 * Get "owner/repo" slug for -R flag.
 */
export function getRepoSlug() {
  const { owner, repo } = getRepoInfo();
  return `${owner}/${repo}`;
}

/**
 * Check if gh CLI is installed and authenticated.
 */
export function isGhAvailable() {
  try {
    gh('auth', 'status');
    return true;
  } catch {
    return false;
  }
}
