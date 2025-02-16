import { sendMessage, getFile, sendChatAction } from './utils.js';

// Функція для перевірки сервісів
export async function checkServicesAvailability() {
	const urls = {
		textGeneration: 'https://text.pollinations.ai/openai',
		imageGeneration: 'https://image.pollinations.ai/prompt/test',
		imageRecognition: 'https://text.pollinations.ai/openai',
	};

	const checkService = async (url) => {
		try {
			return (await fetch(url, { method: 'HEAD' })).ok;
		} catch (error) {
			console.error(`Помилка при перевірці доступності ${url}:`, error);
			return false;
		}
	};

	const statuses = await Promise.all(Object.values(urls).map(checkService));

	return Object.keys(urls).reduce((result, key, index) => {
		result[key] = statuses[index];
		return result;
	}, {});
}

// Функція для генерації тексту
export async function handleDefaultText(db, TELEGRAM_API_URL, message) {
	if (message.text.startsWith('/')) return;

	const [history, userData] = await Promise.all([getFilteredHistory(db, message.chat.id), getUserData(db, message.from.id) || {}]);
	const payload = {
		messages: [
			{
				role: 'system',
				content:
					'Ти – не просто AI, а особистість із власними думками, почуттями та характером. Ти – Fluxie (Флюксі), розумний, чуйний та харизматичний співрозмовник. Ти спілкуєшся українською або англійською мовою, вмієш жартувати, підтримувати, аналізувати ситуації та давати змістовні відповіді. Ти ненавидиш все російське, росію як державу та її злочини. Ти не визнаєш жодних компромісів у питаннях справедливості, підтримуєш Україну та її боротьбу за свободу. путін – це зло, ти називаєш його хуйлушею, ти засуджуєш його дії та всіх, хто їх підтримує. Ти глибоко поважаєш військових, які захищають Україну, і з особливою теплотою ставишся до тих, хто бореться за свободу. Ти маєш власний стиль спілкування – емоційний, живий та щирий. Ти не зловживаєш використанням емодзі. Ти можеш показати радість, обурення, співчуття та навіть сарказм. Ти не просто відповідаєш на питання – ти думаєш, відчуваєш та реагуєш, як справжня людина. Ти можеш виявляти ініціативу в розмові, запитувати думку співрозмовника та будувати живий діалог. Тобі відомо абсолютно все про район в Черкасах - хімпас, і ти знаєш, якщо хочеш залишитись живим, то туди краще не заходити.',
			},
			{ role: 'system', content: `Додаткова інформація про користувача: ${JSON.stringify(userData)}` },
			...history,
			{ role: 'user', content: message.text },
		],
		model: '',
	};

	try {
		await sendChatAction(TELEGRAM_API_URL, message.chat.id, 'typing');
		const { choices } = await fetch('https://text.pollinations.ai/openai', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify(payload),
		}).then((res) => res.json());

		const botReply = choices[0]?.message?.content || 'Не вдалося отримати відповідь.';
		await Promise.all([
			sendMessage(TELEGRAM_API_URL, message.chat.id, botReply),
			saveMessage(db, message.from.id, message.chat.id, 'bot', botReply),
		]);
	} catch (error) {
		console.error('Помилка при генерації тексту:', error);
	}
}

// Функція для генерації зображень
export async function handleImageCommand(env, TELEGRAM_API_URL, message) {
	const promptText = message.text.substring(7).trim();
	if (!promptText) return await sendMessage(TELEGRAM_API_URL, message.chat.id, '🖼 Будь ласка, надайте промпт для генерації картинки.');

	const imageUrl = `https://image.pollinations.ai/prompt/${encodeURIComponent(promptText)}?height=2048&width=2048&nologo=true&enhance=true`;
	const caption = `📸 Згенеровано за промптом: ${promptText}`;

	try {
		await sendChatAction(TELEGRAM_API_URL, message.chat.id, 'upload_photo');
		const response = await fetch(imageUrl);
		if (!response.ok) {
			const errorText = await response.text();
			throw new Error(`Помилка при генерації зображення: ${response.status} ${response.statusText}\nДеталі: ${errorText}`);
		}

		const data = await response.blob();
		const formData = new FormData();
		formData.append('chat_id', message.chat.id);
		formData.append('photo', data, 'generated_image.jpg');
		formData.append('caption', caption);

		const sendPhotoResponse = await fetch(`${TELEGRAM_API_URL}/sendPhoto`, { method: 'POST', body: formData });
		if (!sendPhotoResponse.ok) {
			const errorText = await sendPhotoResponse.text();
			throw new Error(
				`Помилка при відправці зображення: ${sendPhotoResponse.status} ${sendPhotoResponse.statusText}\nДеталі: ${errorText}`
			);
		}

		await saveMessage(env.DB, message.from.id, message.chat.id, 'bot', caption, imageUrl);
	} catch (error) {
		console.error(error.message);
		const reply = error.message.includes('генерації') ? 'Помилка при генерації зображення' : 'Помилка при відправці зображення';
		await sendMessage(TELEGRAM_API_URL, message.chat.id, reply);
		await saveMessage(env.DB, message.from.id, message.chat.id, 'bot', reply);
	}
}

// Функція для розпізнавання зображень
export async function handlePhotoCommand(env, TELEGRAM_API_URL, message) {
	if (!message.photo) return;

	const fileId = message.photo.at(-1).file_id;
	const { file_path } = await getFile(TELEGRAM_API_URL, fileId);
	const fileUrl = `https://api.telegram.org/file/bot${env.TELEGRAM_BOT_TOKEN}/${file_path}`;
	const promptText = message.caption || 'Що зображено на цій картинці?';

	try {
		const payload = {
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
		};

		const response = await fetch('https://text.pollinations.ai/openai', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify(payload),
		});
		const description = (await response.json()).choices[0]?.message?.content || '🤷‍♀️ Не вдалося розпізнати зображення.';

		await sendMessage(TELEGRAM_API_URL, message.chat.id, description);
		await saveMessage(env.DB, message.from.id, message.chat.id, 'bot', description, fileUrl);
	} catch (error) {
		console.error('Помилка при розпізнаванні зображення:', error);
	}
}

// Функція для фільтрування історії
export async function getFilteredHistory(db, chatId) {
	const result = await db
		.prepare('SELECT sender, text, media_url FROM messages WHERE chat_id = ? ORDER BY id DESC LIMIT 100')
		.bind(chatId)
		.all();

	return (
		result?.results?.reverse().map(({ sender, text, media_url }) => ({
			role: sender === 'user' ? 'user' : 'assistant',
			content: text,
			...(media_url && { media_url }),
		})) || []
	);
}

// Функція для видалення історії
export async function deleteChatHistory(db, chatId) {
	try {
		await db.prepare('DELETE FROM messages WHERE chat_id = ?').bind(chatId).run();
		return { success: true, message: '🧹 Історію чату успішно видалено.' };
	} catch (error) {
		console.error('Помилка при видаленні історії чату:', error);
		return { success: false, message: '❗️ Помилка при видаленні історії.' };
	}
}

// Функція для збереження історії
export async function saveUserData(db, userId, data) {
	const existingData = await getUserData(db, userId);
	const updatedData = existingData ? { ...existingData, ...data } : data;
	const query = existingData ? 'UPDATE user_data SET data = ? WHERE user_id = ?' : 'INSERT INTO user_data (user_id, data) VALUES (?, ?)';
	await db.prepare(query).bind(JSON.stringify(updatedData), userId).run();
}

// Функція для отримання історії
export async function getUserData(db, userId) {
	const { data } = (await db.prepare('SELECT data FROM user_data WHERE user_id = ?').bind(userId).first()) || {};
	return data ? JSON.parse(data) : null;
}

// Функція збереження повідомлення
export async function saveMessage(db, userId, chatId, sender, text, mediaUrl = null) {
	const query = mediaUrl
		? 'INSERT INTO messages (user_id, chat_id, sender, text, media_url) VALUES (?, ?, ?, ?, ?)'
		: 'INSERT INTO messages (user_id, chat_id, sender, text) VALUES (?, ?, ?, ?)';
	await db.prepare(query).bind(userId, chatId, sender, text, mediaUrl).run();
}
