import { expect, test } from 'bun:test';
import { retryForever } from '../retry.js';

test('retries a rate-limited operation until it succeeds with increasing delays', async () => {
	let attempts = 0;
	const delays = [];

	const result = await retryForever(async () => {
		attempts++;
		if (attempts < 3) {
			const error = new Error('rate limited');
			error.code = 8;
			throw error;
		}
		return { id: '1' };
	}, {
		initialDelayMs: 100,
		maxDelayMs: 1_000,
		random: () => 0,
		sleep: async ms => delays.push(ms),
	});

	expect(result).toEqual({ id: '1' });
	expect(attempts).toBe(3);
	expect(delays).toEqual([100, 200]);
});

test('honors a server retry-after delay before the next attempt', async () => {
	let attempts = 0;
	const delays = [];

	await retryForever(async () => {
		attempts++;
		if (attempts === 1) {
			const error = new Error('HTTP 429');
			error.status = 429;
			error.retryAfterMs = 750;
			throw error;
		}
		return 'ok';
	}, {
		initialDelayMs: 100,
		random: () => 0,
		sleep: async ms => delays.push(ms),
	});

	expect(delays).toEqual([750]);
});
