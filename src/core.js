import { sendChatAction, sendMessage, sendPhoto, getFile, saveMessage } from './utils';

export async function getChatHistory(db, chatId, limit = 10) {
	const { results } = await db
		.prepare(`SELECT role, content FROM messages WHERE chat_id = ? ORDER BY timestamp DESC LIMIT ?`)
		.bind(chatId, limit)
		.all();
	return results.reverse();
}

// Функція генерації тексту
export async function handleDefaultText(TELEGRAM_API_URL, message, db) {
	if (message.text.startsWith('/')) return;

	const chatHistory = await getChatHistory(db, message.chat.id);
	const formattedHistory = chatHistory.map(({ role, content }) => ({ role, content }));

	const payload = {
		messages: [
			{ role: 'system', content: 'Ти – Fluxie, розумний і харизматичний AI-помічник.' },
			...formattedHistory,
			{ role: 'user', content: message.text },
		],
		model: 'gpt-4o',
	};

	try {
		await sendChatAction(TELEGRAM_API_URL, message.chat.id, 'typing');
		const response = await fetch('https://text.pollinations.ai/openai', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify(payload),
		});
		const data = await response.json();
		const botReply = data.choices[0]?.message?.content || 'Не вдалося отримати відповідь.';

		await sendMessage(TELEGRAM_API_URL, message.chat.id, botReply);
		await saveMessage(db, message.chat.id, message.from.id, 'user', message.text);
		await saveMessage(db, message.chat.id, message.from.id, 'assistant', botReply);
	} catch {
		await sendMessage(TELEGRAM_API_URL, message.chat.id, 'Сталася помилка при генерації тексту.');
	}
}

// Функція генерації зображень
export async function handleImageCommand(TELEGRAM_API_URL, message) {
	const promptText = message.text.substring(4).trim();
	if (!promptText) return sendMessage(TELEGRAM_API_URL, message.chat.id, '🖼 Будь ласка, надайте промпт для генерації картинки.');

	const imageUrl = `https://image.pollinations.ai/prompt/${encodeURIComponent(promptText)}?height=2048&width=2048&nologo=true&enhance=true`;
	try {
		await sendChatAction(TELEGRAM_API_URL, message.chat.id, 'upload_photo');
		await sendPhoto(TELEGRAM_API_URL, message.chat.id, imageUrl, `📸 Згенеровано за промптом: ${promptText}`);
	} catch {
		await sendMessage(TELEGRAM_API_URL, message.chat.id, 'Сталася помилка при генерації зображення.');
	}
}

// Функція розпізнавання зображень
export async function handlePhotoCommand(TELEGRAM_API_URL, message, TELEGRAM_BOT_TOKEN) {
	if (!message.photo) return;

	const fileId = message.photo.at(-1).file_id;
	const file = await getFile(TELEGRAM_API_URL, fileId);
	const fileUrl = `https://api.telegram.org/file/bot${TELEGRAM_BOT_TOKEN}/${file.file_path}`;
	const promptText = message.caption || 'Що зображено на цій картинці?';

	try {
		await sendChatAction(TELEGRAM_API_URL, message.chat.id, 'typing');
		const response = await fetch('https://text.pollinations.ai/openai', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({
				messages: [
					{
						role: 'user',
						content: [
							{ type: 'text', text: promptText },
							{ type: 'image_url', image_url: { url: fileUrl } },
						],
					},
				],
				model: 'gpt-4o',
			}),
		});
		const data = await response.json();
		await sendMessage(TELEGRAM_API_URL, message.chat.id, data.choices[0]?.message?.content || '🤷‍♀️ Не вдалося розпізнати зображення.');
	} catch {
		await sendMessage(TELEGRAM_API_URL, message.chat.id, 'Сталася помилка при розпізнаванні зображення.');
	}
}
