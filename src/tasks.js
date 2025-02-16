import { sendMessage, editTelegramMessage } from './utils.js';

// Функція додавання завдання
export async function handleAddTask(db, TELEGRAM_API_URL, chatId, dayArg, timeArg, task) {
	if (!dayArg || !timeArg || !task) {
		return sendMessage(TELEGRAM_API_URL, chatId, 'Неправильний формат команди. Використовуйте /add <день> <час> <завдання>');
	}
	const inlineKeyboard = {
		inline_keyboard: [
			[{ text: 'Рекурсивне ✅', callback_data: `type_${dayArg}_${timeArg}_${task}_recursive` }],
			[{ text: 'Тимчасове ⏳', callback_data: `type_${dayArg}_${timeArg}_${task}_temporary` }],
		],
	};
	console.log('Inline Keyboard:', JSON.stringify(inlineKeyboard));
	await sendMessage(TELEGRAM_API_URL, chatId, 'Оберіть тип завдання:', { reply_markup: inlineKeyboard });
}

// Функція для типу завдання
export async function handleTaskType(db, TELEGRAM_API_URL, chatId, dayArg, timeArg, task, taskType) {
	const currentWeek = getWeekNumber(new Date());
	const newTask = {
		chat_id: chatId,
		day: dayArg,
		time: timeArg,
		task: task,
		status: 'Не виконано',
		type: taskType,
		week: taskType === 'temporary' ? currentWeek : null,
		completed_at: null,
		last_completed_at: null,
	};
	// Перевірка значень перед вставкою
	if (newTask.completed_at === null) delete newTask.completed_at;
	if (newTask.last_completed_at === null) delete newTask.last_completed_at;
	await db
		.prepare(
			'INSERT INTO tasks (chat_id, day, time, task, status, type, week, completed_at, last_completed_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)'
		)
		.bind(
			newTask.chat_id,
			newTask.day,
			newTask.time,
			newTask.task,
			newTask.status,
			newTask.type,
			newTask.week,
			newTask.completed_at || null,
			newTask.last_completed_at || null
		)
		.run();
	await sendMessage(TELEGRAM_API_URL, chatId, 'Завдання додано! ✅');
}

// Функція перегляду завдань
export async function handleViewTasks(db, TELEGRAM_API_URL, chatId, viewDay = 'today', messageId = null) {
	let tasks = await getTasks(db, chatId);
	tasks = resetRecursiveTasks(tasks);
	const today = new Date().toLocaleDateString('en-US', { weekday: 'long' }).toLowerCase();
	const currentWeek = getWeekNumber(new Date());
	const formattedDate = new Date().toLocaleDateString('uk-UA');
	if (viewDay.toLowerCase() === 'today') {
		viewDay = today;
	} else {
		viewDay = viewDay.toLowerCase();
	}
	const tasksForDay = tasks[viewDay] || [];
	const filteredTasks = tasksForDay.filter((task) => {
		if (task.type === 'recursive') {
			return true;
		}
		return task.week === currentWeek;
	});
	const sortedTasks = sortTasksByTime(filteredTasks);
	if (sortedTasks.length === 0) {
		const messageText = `На *${capitalize(viewDay)}* (${formattedDate}) немає завдань. 📅`;
		if (messageId) {
			await editTelegramMessage(TELEGRAM_API_URL, chatId, messageId, messageText, { parse_mode: 'Markdown' });
		} else {
			await sendMessage(TELEGRAM_API_URL, chatId, messageText, { parse_mode: 'Markdown' });
		}
		return;
	}
	const tasksList = sortedTasks.map((task) => `${task.status === 'Виконано' ? '✅' : '🔺'} \`${task.time}\` - ${task.task}`).join('\n');
	const messageText = `Завдання на *${capitalize(viewDay)}* (${formattedDate}):\n${tasksList}`;
	const inlineKeyboard = {
		inline_keyboard: [[{ text: '🔄 Оновити', callback_data: `refresh_${viewDay}` }]],
	};
	if (messageId) {
		await editTelegramMessage(TELEGRAM_API_URL, chatId, messageId, messageText, { reply_markup: inlineKeyboard, parse_mode: 'Markdown' });
	} else {
		await sendMessage(TELEGRAM_API_URL, chatId, messageText, { reply_markup: inlineKeyboard, parse_mode: 'Markdown' });
	}
	await saveTasks(db, chatId, tasks);
}

// Функція перегляду завдань (кнопки)
export async function handleViewTasksButtons(db, TELEGRAM_API_URL, chatId, viewDay, messageId) {
	let tasks = await getTasks(db, chatId);
	const tasksForDay = tasks[viewDay] || [];
	const filteredTasks = tasksForDay.filter((task) => {
		if (task.type === 'recursive') {
			return true;
		}
		return task.week === getWeekNumber(new Date());
	});
	const sortedTasks = sortTasksByTime(filteredTasks);
	if (sortedTasks.length === 0) {
		const messageText = `На *${capitalize(viewDay)}* немає завдань. 📅`;
		if (messageId) {
			await editTelegramMessage(TELEGRAM_API_URL, chatId, messageId, messageText, { parse_mode: 'Markdown' });
		} else {
			await sendMessage(TELEGRAM_API_URL, chatId, messageText, { parse_mode: 'Markdown' });
		}
		return;
	}
	const inlineKeyboard = {
		inline_keyboard: sortedTasks.map((t, index) => [
			{
				text: `${t.status === 'Виконано' ? '✅' : '❌'} ${t.time} - ${t.task}`,
				callback_data: `task_${viewDay}_${index}`,
			},
		]),
	};
	const messageText = `Завдання на *${capitalize(viewDay)}*:\n`;
	if (messageId) {
		await editTelegramMessage(TELEGRAM_API_URL, chatId, messageId, messageText, { reply_markup: inlineKeyboard, parse_mode: 'Markdown' });
	} else {
		await sendMessage(TELEGRAM_API_URL, chatId, messageText, { reply_markup: inlineKeyboard, parse_mode: 'Markdown' });
	}
}

// Функція скидання прогресу
export function resetRecursiveTasks(tasks) {
	const now = new Date();
	const currentWeek = getWeekNumber(now);
	for (const day in tasks) {
		tasks[day] = tasks[day].map((task) => {
			if (task.type === 'recursive' && task.status === 'Виконано') {
				const lastCompletedDate = task.last_completed_at ? new Date(task.last_completed_at) : null;
				if (!lastCompletedDate || getWeekNumber(lastCompletedDate) < currentWeek) {
					return { ...task, status: 'Не виконано', completed_at: null };
				}
			}
			return task;
		});
	}
	return tasks;
}

// Функція отримання статистики
export async function handleStats(db, TELEGRAM_API_URL, chatId, period) {
	const tasks = await getTasks(db, chatId);
	const now = new Date();
	let startDate, endDate;
	if (period === 'week') {
		startDate = new Date(now.setDate(now.getDate() - now.getDay()));
		endDate = new Date(startDate);
		endDate.setDate(startDate.getDate() + 6);
	} else if (period === 'month') {
		const test = `😔 Вибачте за незручності.\n🔺Сервіс тимчасово недоступний.`;
		await sendMessage(TELEGRAM_API_URL, chatId, test);
		return;
	}
	let completedTasks = 0;
	let totalTasks = 0;
	for (const day in tasks) {
		for (const task of tasks[day]) {
			if (task.completed_at) {
				const completedDate = new Date(task.completed_at);
				if (completedDate >= startDate && completedDate <= endDate) {
					completedTasks++;
				}
			}
			totalTasks++;
		}
	}
	const statsMessage = `Статистика за ${period}:\n- Виконано завдань: ${completedTasks}\n- Загальна кількість завдань: ${totalTasks}`;
	await sendMessage(TELEGRAM_API_URL, chatId, statsMessage, { parse_mode: 'Markdown' });
}

// Функція отримання тижня
export function getWeekNumber(date) {
	const startOfYear = new Date(date.getFullYear(), 0, 1);
	const diffTime = date - startOfYear;
	const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
	return Math.ceil(diffDays / 7);
}

// Функція сортування завдань
export function sortTasksByTime(tasks) {
	return tasks.sort((a, b) => {
		const timeA = new Date(`1970-01-01T${a.time}:00Z`);
		const timeB = new Date(`1970-01-01T${b.time}:00Z`);
		return timeA - timeB;
	});
}

// Функція отримання завдань (БД)
export async function getTasks(db, chatId) {
	const rows = await db.prepare('SELECT * FROM tasks WHERE chat_id = ?').bind(chatId).all();
	const tasks = {};
	rows.results.forEach((row) => {
		if (!tasks[row.day]) tasks[row.day] = [];
		tasks[row.day].push({
			id: row.id,
			chat_id: row.chat_id,
			day: row.day,
			time: row.time,
			task: row.task,
			status: row.status,
			type: row.type,
			week: row.week,
			completed_at: row.completed_at,
			last_completed_at: row.last_completed_at,
		});
	});
	return tasks;
}

// Функція збереження завдань (БД)
export async function saveTasks(db, chatId, tasks) {
	await db.prepare('DELETE FROM tasks WHERE chat_id = ?').bind(chatId).run();
	for (const day in tasks) {
		for (const task of tasks[day]) {
			await db
				.prepare(
					'INSERT INTO tasks (chat_id, day, time, task, status, type, week, completed_at, last_completed_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)'
				)
				.bind(task.chat_id, task.day, task.time, task.task, task.status, task.type, task.week, task.completed_at, task.last_completed_at)
				.run();
		}
	}
}

// Функція реєстру
function capitalize(str) {
	return str.charAt(0).toUpperCase() + str.slice(1);
}
