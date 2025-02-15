async function fetchTelegramAPI(TELEGRAM_API_URL, method, body) {
	const response = await fetch(`${TELEGRAM_API_URL}/${method}`, {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify(body),
	});
	return response.json();
}

export async function sendMessage(TELEGRAM_API_URL, chatId, text, options = {}) {
	return fetchTelegramAPI(TELEGRAM_API_URL, 'sendMessage', { chat_id: chatId, text, ...options });
}

export async function editTelegramMessage(TELEGRAM_API_URL, chatId, messageId, text, options = {}) {
	return fetchTelegramAPI(TELEGRAM_API_URL, 'editMessageText', { chat_id: chatId, message_id: messageId, text, ...options });
}

export async function sendPhoto(TELEGRAM_API_URL, chatId, photoUrl, caption = '') {
	return fetchTelegramAPI(TELEGRAM_API_URL, 'sendPhoto', { chat_id: chatId, photo: photoUrl, caption });
}

export async function getFile(TELEGRAM_API_URL, fileId) {
	const data = await fetchTelegramAPI(TELEGRAM_API_URL, 'getFile', { file_id: fileId });
	return data.result;
}

export async function sendChatAction(TELEGRAM_API_URL, chatId, action) {
	return fetchTelegramAPI(TELEGRAM_API_URL, 'sendChatAction', { chat_id: chatId, action });
}

export async function deleteMessage(TELEGRAM_API_URL, chatId, messageId) {
	return fetchTelegramAPI(TELEGRAM_API_URL, 'deleteMessage', { chat_id: chatId, message_id: messageId });
}

export async function checkGroupAdmins(TELEGRAM_API_URL, chatID, allowedUsers) {
	try {
		const data = await fetchTelegramAPI(TELEGRAM_API_URL, 'getChatAdministrators', { chat_id: chatID });
		if (!data.ok) return false;

		const admins = new Set(data.result.map((admin) => admin.user.id));
		return allowedUsers.some((userID) => admins.has(userID));
	} catch {
		return false;
	}
}
