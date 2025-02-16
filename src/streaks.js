import { sendMessage } from './utils';

// Функція додавання цілі
export async function handleAddStreak(db, TELEGRAM_API_URL, chatId, goalName) {
	if (!goalName) {
		return sendMessage(TELEGRAM_API_URL, chatId, '⚠️ **Неправильний формат команди!**\nВикористовуйте:\n`/streak add <назва цілі>`', {
			parse_mode: 'Markdown',
		});
	}

	let streaks = await getUserStreaks(db, chatId);

	if (streaks[goalName]) {
		return sendMessage(
			TELEGRAM_API_URL,
			chatId,
			`🚫 **Ціль \`${goalName}\` вже існує!**\nВикористовуйте команду:\n\`/streak check\` для перегляду.`,
			{ parse_mode: 'Markdown' }
		);
	}

	streaks[goalName] = {
		startDate: new Date().toISOString(),
		lastChecked: new Date().toISOString(),
		streakCount: 1,
	};

	await saveUserStreaks(db, chatId, streaks);
	await sendMessage(TELEGRAM_API_URL, chatId, `✅ **Ціль \`${goalName}\` успішно додана!** 🎉`, { parse_mode: 'Markdown' });
}

// Функція перевірки цілі
export async function handleCheckStreaks(db, TELEGRAM_API_URL, chatId) {
	let streaks = await getUserStreaks(db, chatId);

	if (Object.keys(streaks).length === 0) {
		return sendMessage(
			TELEGRAM_API_URL,
			chatId,
			'ℹ️ **Активних streaks не знайдено.**\nДодайте нову ціль за допомогою:\n`/streak add <назва цілі>`',
			{ parse_mode: 'Markdown' }
		);
	}

	const now = new Date();
	let streakMessages = [];

	for (const goalName in streaks) {
		const streak = streaks[goalName];
		const lastCheckedDate = new Date(streak.lastChecked);
		const daysSinceLastCheck = Math.floor((now - lastCheckedDate) / (1000 * 60 * 60 * 24));

		if (daysSinceLastCheck > 1) {
			streak.streakCount = 1;
			streak.startDate = now.toISOString();
			streak.lastChecked = now.toISOString();
			await sendMessage(TELEGRAM_API_URL, chatId, `❌ **Ціль \`${goalName}\` зірвалася!**\nНова спроба почалася сьогодні.`, {
				parse_mode: 'Markdown',
			});
		} else if (daysSinceLastCheck === 1) {
			streak.streakCount += 1;
			streak.lastChecked = now.toISOString();
		}

		const startDate = new Date(streak.startDate);
		const streakDuration = Math.floor((now - startDate) / (1000 * 60 * 60 * 24)) + 1;

		streakMessages.push(
			`*Ціль:* \`${goalName}\`\n*Старт:* ${startDate.toLocaleDateString()}\n*Поточний streak:* \`${
				streak.streakCount
			} днів\` (_${streakDuration} днів без перерви_)`
		);
	}

	await saveUserStreaks(db, chatId, streaks);

	const messageText = streakMessages.join('\n\n');
	await sendMessage(TELEGRAM_API_URL, chatId, messageText, { parse_mode: 'Markdown' });
}

// Функція видалення цілі
export async function handleDeleteStreak(db, TELEGRAM_API_URL, chatId, goalName) {
	if (!goalName) {
		return sendMessage(TELEGRAM_API_URL, chatId, '⚠️ **Неправильний формат команди!**\nВикористовуйте:\n`/streak delete <назва цілі>`', {
			parse_mode: 'Markdown',
		});
	}

	let streaks = await getUserStreaks(db, chatId);

	if (!streaks[goalName]) {
		return sendMessage(TELEGRAM_API_URL, chatId, `❓ **Ціль \`${goalName}\` не знайдена!**`, { parse_mode: 'Markdown' });
	}

	delete streaks[goalName];
	await saveUserStreaks(db, chatId, streaks);
	await sendMessage(TELEGRAM_API_URL, chatId, `✅ **Ціль \`${goalName}\` успішно видалена!**`, { parse_mode: 'Markdown' });
}

// Функція отримання цілей DB
export async function getUserStreaks(db, chatId) {
	const result = await db.prepare('SELECT streaks FROM user_streaks WHERE chat_id = ?').bind(chatId).first();
	return result?.streaks ? JSON.parse(result.streaks) : {};
}

// Функція зберігання цілей DB
export async function saveUserStreaks(db, chatId, streaks) {
	await db.prepare('INSERT OR REPLACE INTO user_streaks (chat_id, streaks) VALUES (?, ?)').bind(chatId, JSON.stringify(streaks)).run();
}
