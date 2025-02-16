import { handleAddStreak, handleCheckStreaks, handleDeleteStreak } from './streaks';
import { saveUserData, getUserData, checkServicesAvailability } from './assistant';
import { handleAddTask, handleViewTasks, handleStats } from './tasks.js';
import { sendMessage, saveMessage, deleteMessage } from './utils';

// Функція старту
export async function handleStartCommand(env, TELEGRAM_API_URL, message) {
	const chatId = message.chat.id;
	const command = 'start';
	const previousRecord = await env.DB.prepare('SELECT message_id FROM bot_messages WHERE chat_id = ? AND command = ?')
		.bind(chatId, command)
		.first();

	if (previousRecord && previousRecord.message_id) {
		try {
			await deleteMessage(TELEGRAM_API_URL, chatId, previousRecord.message_id);
		} catch (error) {
			console.error('Не вдалося видалити попереднє повідомлення для /start:', error);
		}
	}

	const userData = (await getUserData(env.DB, message.from.id)) || {};
	const userName = userData.first_name || 'користувач';
	const reply = `Привіт, ${userName}! 👋\n\nМене звати Флюксі. Обери команду нижче, або просто спілкуйся зі мною.`;

	const keyboard = {
		inline_keyboard: [
			[
				{ text: '🇺🇦 На ЗСУ', url: 'https://savelife.in.ua/projects/status/active/' },
				{ text: '❓ Допомога', callback_data: 'help' },
			],
		],
	};

	const sentMessage = await sendMessage(TELEGRAM_API_URL, chatId, reply, {
		reply_markup: JSON.stringify(keyboard),
	});

	await env.DB.prepare('INSERT OR REPLACE INTO bot_messages (chat_id, command, message_id) VALUES (?, ?, ?)')
		.bind(chatId, command, sentMessage.message_id)
		.run();

	await deleteMessage(TELEGRAM_API_URL, chatId, message.message_id);
}

// Функція для допомоги
export async function handleHelpCommand(env, TELEGRAM_API_URL, message, shouldDeleteOriginalMessage = true) {
	const chatId = message.chat.id;
	const command = 'help';
	const previousRecord = await env.DB.prepare('SELECT message_id FROM bot_messages WHERE chat_id = ? AND command = ?')
		.bind(chatId, command)
		.first();

	if (previousRecord && previousRecord.message_id) {
		try {
			await deleteMessage(TELEGRAM_API_URL, chatId, previousRecord.message_id);
		} catch (error) {
			console.error('Не вдалося видалити попереднє повідомлення /help:', error);
		}
	}

	const keyboard = {
		inline_keyboard: [
			[
				{ text: '🚀 Основні', callback_data: 'help_main' },
				{ text: '💠 ШІ', callback_data: 'help_ai' },
			],
			[
				{ text: '📝 Завдання', callback_data: 'help_tasks' },
				{ text: '🎯 Цілі', callback_data: 'help_streaks' },
			],
			[{ text: '📊 Статистика', callback_data: 'help_stats' }],
		],
	};

	const reply = `✻ *Вітаю!* Я Флюксі, і вмію багато чого.

	📲 _Виберіть категорію, щоб отримати допомогу по команді._`;

	const sentMessage = await sendMessage(TELEGRAM_API_URL, chatId, reply, {
		parse_mode: 'Markdown',
		reply_markup: JSON.stringify(keyboard),
	});

	await env.DB.prepare('INSERT OR REPLACE INTO bot_messages (chat_id, command, message_id) VALUES (?, ?, ?)')
		.bind(chatId, command, sentMessage.message_id)
		.run();

	if (shouldDeleteOriginalMessage && message.message_id) {
		await deleteMessage(TELEGRAM_API_URL, chatId, message.message_id);
	}
}

// Функція створення цілі
export async function handleStreakCommand(db, TELEGRAM_API_URL, message) {
	const args = message.text.substring(8).trim().split(' ');
	if (args.length < 1) {
		const reply = 'Неправильний формат команди. Використовуйте /streak add <назва цілі>, /streak check або /streak delete <назва цілі>.';
		await sendMessage(TELEGRAM_API_URL, message.chat.id, reply);
		return;
	}
	const streakCommand = args[0];
	if (streakCommand === 'add') {
		const goalName = args.slice(1).join(' ');
		await handleAddStreak(db, TELEGRAM_API_URL, message.chat.id, goalName);
	} else if (streakCommand === 'check') {
		await handleCheckStreaks(db, TELEGRAM_API_URL, message.chat.id);
	} else if (streakCommand === 'delete') {
		const goalName = args.slice(1).join(' ');
		await handleDeleteStreak(db, TELEGRAM_API_URL, message.chat.id, goalName);
	} else {
		const reply =
			'⚠️ *Невідома команда streak.*\n\nВикористовуйте `/streak add <назва цілі>`, `/streak check` або `/streak delete <назва цілі>`.';
		await sendMessage(TELEGRAM_API_URL, message.chat.id, reply, { parse_mode: 'Markdown' });
	}
}

// Функція для перевірки статусу
export async function handleStatusCommand(env, TELEGRAM_API_URL, message) {
	const status = await checkServicesAvailability();
	const reply =
		`✻ *Статус доступності:*\n\n` +
		`Генерація тексту: ${status.textGeneration ? '💚' : '❤️'}\n` +
		`Генерація зображень: ${status.imageGeneration ? '💚' : '❤️'}\n` +
		`Розпізнавання зображень: ${status.imageRecognition ? '💚' : '❤️'}`;

	await sendMessage(TELEGRAM_API_URL, message.chat.id, reply, { parse_mode: 'Markdown' });
	await saveMessage(env.DB, message.from.id, message.chat.id, 'bot', reply);
}

// Функція додавання важливої інформації
export async function handleSetDataCommand(db, TELEGRAM_API_URL, message) {
	const data = message.text.substring(8).trim();
	if (!data) {
		const reply = '📃 Будь ласка, надайте дані для запису.';
		await sendMessage(TELEGRAM_API_URL, message.chat.id, reply);
		return;
	}
	await saveUserData(db, message.from.id, data);
	const reply = `🎉 Дані успішно записані: \`${data}\``;
	await sendMessage(TELEGRAM_API_URL, message.chat.id, reply, { parse_mode: 'Markdown' });
	await saveMessage(db, message.from.id, message.chat.id, 'bot', reply);
}

// Функція для отримання ID
export async function handleIdCommand(env, TELEGRAM_API_URL, message) {
	let reply;

	if (message.reply_to_message && message.reply_to_message.sticker) {
		reply = `🖼 ID стікера: \`${message.reply_to_message.sticker.file_id}\``;
	} else {
		reply = `🪪 Ваш Telegram ID: \`${message.from.id}\``;
	}

	await sendMessage(TELEGRAM_API_URL, message.chat.id, reply, { parse_mode: 'Markdown' });
	await saveMessage(env.DB, message.from.id, message.chat.id, 'bot', reply);
}

// Функція додавання завданння
export async function handleAddCommand(db, TELEGRAM_API_URL, message) {
	const args = message.text.substring(5).trim().split(' ');
	if (args.length < 3) {
		const reply = 'Неправильний формат команди. Використовуйте /add <день> <час> <завдання>';
		await sendMessage(TELEGRAM_API_URL, message.chat.id, reply);
		return;
	}
	const [dayArg, timeArg, ...taskParts] = args;
	const task = taskParts.join(' ');
	await handleAddTask(db, TELEGRAM_API_URL, message.chat.id, dayArg, timeArg, task);
}

// Функція перегляду сьогодні
export async function handleTodayCommand(db, TELEGRAM_API_URL, message) {
	await handleViewTasks(db, TELEGRAM_API_URL, message.chat.id, 'today');
}

// Функція перегляду певного дня
export async function handleTasksCommand(db, TELEGRAM_API_URL, message) {
	const dayArg = message.text.substring(7).trim();
	await handleViewTasks(db, TELEGRAM_API_URL, message.chat.id, dayArg);
}

// Функція статистики
export async function handleStatsCommand(db, TELEGRAM_API_URL, message) {
	const period = message.text.substring(7).trim().toLowerCase();
	if (period === 'week' || period === 'month') {
		await handleStats(db, TELEGRAM_API_URL, message.chat.id, period);
	} else {
		const reply = 'Невідомий період. Використовуйте /stats week або /stats month.';
		await sendMessage(TELEGRAM_API_URL, message.chat.id, reply);
	}
}

// Функція для розсилки
export async function handleBroadcastCommand(env, TELEGRAM_API_URL, message, admins) {
	const senderID = message.from.id;
	if (!admins.includes(senderID)) {
		await sendMessage(TELEGRAM_API_URL, message.chat.id, '❌ У вас немає прав для розсилки повідомлень.');
		return;
	}

	const args = message.text.split(' ');
	if (args.length < 2) {
		await sendMessage(TELEGRAM_API_URL, message.chat.id, '⚠ Формат: /broadcast <user_id або "all"> <message>');
		return;
	}

	const target = args[1];
	const text = args.slice(2).join(' ');

	if (!text) {
		await sendMessage(TELEGRAM_API_URL, message.chat.id, '⚠ Будь ласка, введіть текст повідомлення.');
		return;
	}

	if (target.toLowerCase() === 'all') {
		const { results } = await env.DB.prepare(`SELECT user_id FROM user_data`).all();

		if (results.length === 0) {
			await sendMessage(TELEGRAM_API_URL, message.chat.id, '⚠ У базі немає користувачів для розсилки.');
			return;
		}

		for (const user of results) {
			await sendMessage(TELEGRAM_API_URL, user.user_id, `📢 *Оголошення від адміністрації:*\n\n${text}`, { parse_mode: 'Markdown' });
			await new Promise((resolve) => setTimeout(resolve, 500));
		}

		await sendMessage(TELEGRAM_API_URL, message.chat.id, `✅ Повідомлення надіслано *${results.length}* користувачам.`, {
			parse_mode: 'Markdown',
		});
	} else {
		await sendMessage(TELEGRAM_API_URL, target, `📢 *Оголошення від адміністрації:*\n\n${text}`, { parse_mode: 'Markdown' });
		await sendMessage(TELEGRAM_API_URL, message.chat.id, '✅ Повідомлення надіслано користувачу.');
	}
}
