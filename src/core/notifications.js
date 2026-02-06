import notifier from 'node-notifier';
import path from 'path';
import { getMyDayTasks, listTasks } from './github.js';

const APP_NAME = 'TaskPlanner';

/**
 * Send a macOS system notification
 */
export function sendNotification(title, message, options = {}) {
  return new Promise((resolve, reject) => {
    notifier.notify(
      {
        title: `📋 ${APP_NAME}: ${title}`,
        message: message,
        sound: options.sound !== false,
        timeout: options.timeout || 10,
        icon: options.icon || undefined,
        contentImage: undefined,
        open: options.url || undefined,
      },
      (err, response) => {
        if (err) reject(err);
        else resolve(response);
      }
    );
  });
}

/**
 * Send morning briefing notification
 */
export async function sendMorningBriefing() {
  try {
    const myDay = await getMyDayTasks();
    const totalFocus = myDay.total_focus;
    const overdue = myDay.overdue.length;

    let message = '';
    if (totalFocus === 0) {
      message = '✨ No tasks scheduled for today. Enjoy your day!';
    } else {
      message = `📌 ${totalFocus} tasks for today`;
      if (overdue > 0) message += ` (⚠️ ${overdue} overdue)`;
      message += '\n';

      const topTasks = [...myDay.my_day, ...myDay.due_today, ...myDay.overdue].slice(0, 3);
      for (const task of topTasks) {
        const priority = { urgent: '🔴', high: '🟠', medium: '🟡', low: '🟢' }[task.priority] || '⚪';
        message += `${priority} #${task.id}: ${task.title}\n`;
      }
      if (totalFocus > 3) message += `... and ${totalFocus - 3} more`;
    }

    await sendNotification('Good Morning! ☀️', message);
    return { success: true, message };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

/**
 * Send overdue tasks alert
 */
export async function sendOverdueAlert() {
  try {
    const tasks = await listTasks();
    const today = new Date().toISOString().split('T')[0];
    const overdue = tasks.filter(t => t.due_date && t.due_date < today && t.status !== 'done');

    if (overdue.length === 0) return { success: true, message: 'No overdue tasks' };

    let message = `⚠️ You have ${overdue.length} overdue task${overdue.length > 1 ? 's' : ''}:\n`;
    for (const task of overdue.slice(0, 5)) {
      message += `• #${task.id}: ${task.title} (due ${task.due_date})\n`;
    }

    await sendNotification('Overdue Tasks', message);
    return { success: true, message };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

/**
 * Send task completion notification
 */
export async function sendTaskCompleted(task) {
  const message = `✅ Completed: #${task.id} - ${task.title}`;
  await sendNotification('Task Done!', message);
}

/**
 * Schedule recurring notifications (for use with background process)
 */
export function startNotificationScheduler(morningTime = '09:00') {
  const [hours, minutes] = morningTime.split(':').map(Number);

  const checkAndNotify = async () => {
    const now = new Date();
    if (now.getHours() === hours && now.getMinutes() === minutes) {
      await sendMorningBriefing();
    }

    // Check for overdue tasks at 2 PM
    if (now.getHours() === 14 && now.getMinutes() === 0) {
      await sendOverdueAlert();
    }
  };

  // Check every minute
  const interval = setInterval(checkAndNotify, 60000);

  // Also send an immediate briefing
  sendMorningBriefing().catch(() => {});

  return { stop: () => clearInterval(interval) };
}
