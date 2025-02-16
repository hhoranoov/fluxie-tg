// Загальна функція для надсилання запиту
async function sendTelegramRequest(TELEGRAM_API_URL, method, payload) {
	const response = await fetch(`${TELEGRAM_API_URL}/${method}`, {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify(payload),
	});
	const data = await response.json();
	return data.result || data;
}

// Функція надсилання повідомлень
export async function sendMessage(TELEGRAM_API_URL, chatId, text, options = {}) {
	return sendTelegramRequest(TELEGRAM_API_URL, 'sendMessage', { chat_id: chatId, text, ...options });
}

// Функція для редагування повідомлень
export async function editTelegramMessage(TELEGRAM_API_URL, chatId, messageId, text, options = {}) {
	return sendTelegramRequest(TELEGRAM_API_URL, 'editMessageText', { chat_id: chatId, message_id: messageId, text, ...options });
}

// Функція надсилання зображень
export async function sendPhoto(TELEGRAM_API_URL, chatId, photoUrl, caption = '') {
	return sendTelegramRequest(TELEGRAM_API_URL, 'sendPhoto', { chat_id: chatId, photo: photoUrl, caption });
}

// Функція отримання файлу
export async function getFile(TELEGRAM_API_URL, fileId) {
	const response = await fetch(`${TELEGRAM_API_URL}/getFile?file_id=${fileId}`);
	const data = await response.json();
	return data.result;
}

// Функція для відправлення chatAction
export async function sendChatAction(TELEGRAM_API_URL, chatId, action) {
	return sendTelegramRequest(TELEGRAM_API_URL, 'sendChatAction', { chat_id: chatId, action });
}

// Функція для видалення повідомлення
export async function deleteMessage(TELEGRAM_API_URL, chatId, messageId) {
	try {
		await sendTelegramRequest(TELEGRAM_API_URL, 'deleteMessage', { chat_id: chatId, message_id: messageId });
	} catch (error) {
		console.error('Не вдалося видалити повідомлення:', error);
	}
}
