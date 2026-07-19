const DEFAULT_INITIAL_DELAY_MS = 500;
const DEFAULT_MAX_DELAY_MS = 60_000;

export function isRateLimited(error) {
	return error?.status === 429 ||
		error?.code === 8 ||
		error?.code === 'RESOURCE_EXHAUSTED';
}

export function retryDelayMs(attempt, error, {
	initialDelayMs = DEFAULT_INITIAL_DELAY_MS,
	maxDelayMs = DEFAULT_MAX_DELAY_MS,
	random = Math.random,
} = {}) {
	const exponentialDelay = Math.min(maxDelayMs, initialDelayMs * (2 ** attempt));
	const jitteredDelay = Math.round(exponentialDelay * (1 + random() * 0.25));
	return Math.max(jitteredDelay, error?.retryAfterMs || 0);
}

export async function retryForever(operation, options = {}) {
	const sleep = options.sleep || (ms => Bun.sleep(ms));
	let attempt = 0;

	while (true) {
		try {
			return await operation();
		} catch (error) {
			const delayMs = retryDelayMs(attempt, error, options);
			await options.onRetry?.({ attempt, error, delayMs });
			await sleep(delayMs);
			attempt++;
		}
	}
}
