import { handleDefaultText, handleImageCommand, handlePhotoCommand } from './core';

export default {
	async fetch(request, env) {
		const TELEGRAM_API_URL = `https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}`;
		const db = env.DB;
		const update = await request.json();
		const message = update.message;

		if (message.text && message.text.startsWith('/gen')) {
			await handleImageCommand(TELEGRAM_API_URL, message);
		} else if (message.photo) {
			await handlePhotoCommand(TELEGRAM_API_URL, message, env.TELEGRAM_BOT_TOKEN);
		} else if (message.text) {
			await handleDefaultText(TELEGRAM_API_URL, message, db);
		}

		return new Response('OK', { status: 200 });
	},
};4
