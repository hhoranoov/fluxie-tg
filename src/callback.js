import { handleTaskType, handleViewTasks, handleViewTasksButtons, getTasks, saveTasks, sortTasksByTime, getWeekNumber } from './tasks.js';
import { sendMessage, editTelegramMessage } from './utils.js';
import { handleHelpCommand } from './handlers.js';

export async function handleCallbackQuery(env, TELEGRAM_API_URL, callbackQuery) {
	if (!callbackQuery || !callbackQuery.message || !callbackQuery.message.chat) {
		console.error('Invalid callback query structure:', callbackQuery);
		return;
	}

	const chatId = callbackQuery.message.chat.id;
	const messageId = callbackQuery.message.message_id;
	const data = callbackQuery.data;

	const helpTexts = {
		help_tasks: {
			text: `📝 *Команди для завдань:*\n
- /add <день> <час> <завдання> - додати нове завдання\n
- /today - переглянути завдання на сьогодні\n
- /tasks <день> - переглянути завдання на конкретний день\n
**Функціонал в розробці**`,
			keyboard: [[{ text: '⬅️ Назад', callback_data: 'help' }]],
		},

		help_ai: {
			text: `💠 *Команди ШІ:*\n
- /status - перевірити статус ШІ сервісів\n
- /image <промпт> - згенерити зображення\n
- /remember <дані> - додати в пам'ять ШІ`,
			keyboard: [[{ text: '⬅️ Назад', callback_data: 'help' }]],
		},

		help_main: {
			text: `🚀 *Основні команди:*\n
- /start - почати роботу з ботом\n
- /help - отримати допомогу\n
- /id - отримати ID користувача`,
			keyboard: [[{ text: '⬅️ Назад', callback_data: 'help' }]],
		},

		help_stats: {
			text: `📊 *Статистика:*\n
- /stats week - статистика за тиждень\n
- /stats month - статистика за місяць`,
			keyboard: [[{ text: '⬅️ Назад', callback_data: 'help' }]],
		},

		help_streaks: {
			text: `🎯 *Цілі (Streaks):*\n
- /streak add <назва> - додати нову ціль\n
- /streak check - перевірити streaks\n
- /streak delete <назва> - видалити ціль`,
			keyboard: [[{ text: '⬅️ Назад', callback_data: 'help' }]],
		},
	};

	const db = env.DB;

	if (helpTexts[data]) {
		await editTelegramMessage(TELEGRAM_API_URL, chatId, messageId, helpTexts[data].text, {
			parse_mode: 'Markdown',
			reply_markup: JSON.stringify({ inline_keyboard: helpTexts[data].keyboard }),
		});
		// Обробник help
	} else if (data === 'help') {
		await handleHelpCommand(env, TELEGRAM_API_URL, callbackQuery.message, false);
	} else if (data.startsWith('type_')) {
		const parts = data.split('_');
		const dayArg = parts[1];
		const timeArg = parts[2];
		const task = parts.slice(3, -1).join(' ');
		const taskType = parts[parts.length - 1];
		await handleTaskType(db, TELEGRAM_API_URL, chatId, dayArg, timeArg, task, taskType);
	} else if (data.startsWith('task_')) {
		const parts = data.split('_');
		const viewDay = parts[1];
		const taskIndex = parseInt(parts[2], 10);
		let tasks = await getTasks(db, chatId);
		const tasksForDay = tasks[viewDay] || [];
		const filteredTasks = tasksForDay.filter((task) => {
			if (task.type === 'recursive') {
				return true;
			}
			return task.week === getWeekNumber(new Date());
		});
		const sortedTasks = sortTasksByTime(filteredTasks);
		if (taskIndex >= 0 && taskIndex < sortedTasks.length) {
			const taskInfo = sortedTasks[taskIndex];
			const toggleStatusText = taskInfo.status === 'Не виконано' ? '✅ Виконано' : '❌ Не виконано';
			const inlineKeyboard = {
				inline_keyboard: [
					[
						{ text: toggleStatusText, callback_data: `toggle_${viewDay}_${taskIndex}` },
						{ text: '🗑️ Видалити', callback_data: `delete_${viewDay}_${taskIndex}` },
					],
					[{ text: 'Назад', callback_data: `back_${viewDay}` }],
				],
			};
			const messageText = `Завдання: *${taskInfo.task}*\nЧас: *${taskInfo.time}*\nСтатус: *${
				taskInfo.status === 'Не виконано' ? '❌' : '✅'
			}*`;
			await editTelegramMessage(TELEGRAM_API_URL, chatId, messageId, messageText, { reply_markup: inlineKeyboard, parse_mode: 'Markdown' });
		} else {
			await sendMessage(TELEGRAM_API_URL, chatId, 'Завдання не знайдено 🔍');
		}
	} else if (data.startsWith('toggle_')) {
		const parts = data.split('_');
		const viewDay = parts[1];
		const taskIndex = parseInt(parts[2], 10);
		let tasks = await getTasks(db, chatId);
		const tasksForDay = tasks[viewDay] || [];
		const filteredTasks = tasksForDay.filter((task) => {
			if (task.type === 'recursive') {
				return true;
			}
			return task.week === getWeekNumber(new Date());
		});
		const sortedTasks = sortTasksByTime(filteredTasks);
		if (taskIndex >= 0 && taskIndex < sortedTasks.length) {
			const taskInfo = sortedTasks[taskIndex];
			taskInfo.status = taskInfo.status === 'Не виконано' ? 'Виконано' : 'Не виконано';
			if (taskInfo.status === 'Виконано') {
				taskInfo.completed_at = new Date().toISOString();
				taskInfo.last_completed_at = new Date().toISOString();
			}
			await db
				.prepare('UPDATE tasks SET status = ?, completed_at = ?, last_completed_at = ? WHERE id = ?')
				.bind(taskInfo.status, taskInfo.completed_at, taskInfo.last_completed_at, taskInfo.id)
				.run();
			await handleViewTasks(db, TELEGRAM_API_URL, chatId, viewDay, messageId);
		} else {
			await sendMessage(TELEGRAM_API_URL, chatId, 'Завдання не знайдено 🔍');
		}
	} else if (data.startsWith('delete_')) {
		const parts = data.split('_');
		const viewDay = parts[1];
		const taskIndex = parseInt(parts[2], 10);
		let tasks = await getTasks(db, chatId);
		const tasksForDay = tasks[viewDay] || [];
		const filteredTasks = tasksForDay.filter((task) => {
			if (task.type === 'recursive') {
				return true;
			}
			return task.week === getWeekNumber(new Date());
		});
		const sortedTasks = sortTasksByTime(filteredTasks);
		if (taskIndex >= 0 && taskIndex < sortedTasks.length) {
			const taskInfo = sortedTasks[taskIndex];
			await db.prepare('DELETE FROM tasks WHERE id = ?').bind(taskInfo.id).run();
			await handleViewTasks(db, TELEGRAM_API_URL, chatId, viewDay, messageId);
		} else {
			await sendMessage(TELEGRAM_API_URL, chatId, 'Завдання не знайдено 🔍');
		}
	} else if (data.startsWith('refresh_')) {
		const parts = data.split('_');
		const viewDay = parts[1];
		await handleViewTasksButtons(db, TELEGRAM_API_URL, chatId, viewDay, messageId);
	} else if (data.startsWith('back_')) {
		const parts = data.split('_');
		const viewDay = parts[1];
		await handleViewTasks(db, TELEGRAM_API_URL, chatId, viewDay, messageId);
	} else if (data.startsWith('delete_all_')) {
		const parts = data.split('_');
		const viewDay = parts[1];
		await db.prepare('DELETE FROM tasks WHERE chat_id = ? AND day = ?').bind(chatId, viewDay).run();
		await handleViewTasks(db, TELEGRAM_API_URL, chatId, viewDay, messageId);
	} else {
		console.error('Unknown callback data:', data);
	}

	// Callback запит оброблено
	await fetch(`${TELEGRAM_API_URL}/answerCallbackQuery`, {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({ callback_query_id: callbackQuery.id }),
	});
}
