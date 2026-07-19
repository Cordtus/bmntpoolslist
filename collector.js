import { isRateLimited, retryForever } from './retry.js';

function createAdaptiveLimiter({
	initialConcurrency = 16,
	minConcurrency = 1,
	maxConcurrency = initialConcurrency,
	recoverySuccesses = 20,
	now = Date.now,
	sleep = ms => Bun.sleep(ms),
} = {}) {
	let active = 0;
	let concurrency = initialConcurrency;
	let cooldownUntil = 0;
	let successesSinceBackoff = 0;

	return {
		async acquire() {
			while (active >= concurrency || now() < cooldownUntil) {
				await sleep(Math.max(1, cooldownUntil - now()));
			}
			active++;
		},
		release() {
			active--;
		},
		onRetry({ error, delayMs }) {
			concurrency = isRateLimited(error)
				? Math.max(minConcurrency, Math.floor(concurrency / 2))
				: Math.max(minConcurrency, concurrency - 1);
			cooldownUntil = Math.max(cooldownUntil, now() + delayMs);
			successesSinceBackoff = 0;
		},
		onSuccess() {
			successesSinceBackoff++;
			if (successesSinceBackoff >= recoverySuccesses && concurrency < maxConcurrency) {
				concurrency++;
				successesSinceBackoff = 0;
			}
		},
	};
}

export async function collectWithAdaptiveConcurrency(items, operation, options = {}) {
	const limiter = createAdaptiveLimiter(options);
	const results = new Array(items.length);
	let nextIndex = 0;
	const workerCount = options.maxConcurrency || options.initialConcurrency || 16;

	async function worker() {
		while (true) {
			const index = nextIndex++;
			if (index >= items.length) return;

			await limiter.acquire();
			try {
				results[index] = await retryForever(() => operation(items[index]), {
					...options,
					onRetry: retry => {
						limiter.onRetry(retry);
						return options.onRetry?.(retry);
					},
				});
				await options.onResult?.(results[index], items[index], index);
				limiter.onSuccess();
			} finally {
				limiter.release();
			}
		}
	}

	await Promise.all(Array.from({ length: Math.min(workerCount, items.length) }, worker));
	return results;
}

function poolType(typeUrl = '') {
	if (typeUrl.includes('concentratedliquidity')) return 'concentratedliquidity';
	if (typeUrl.includes('stableswap')) return 'stableswap';
	if (typeUrl.includes('cosmwasmpool')) return 'cosmwasmpool';
	if (typeUrl.includes('gamm')) return 'gamm';
	return 'unknown';
}

function normalizeLiquidity(liquidity = []) {
	return Object.fromEntries(liquidity.map((entry, index) => [
		`token${index + 1}`,
		{ denom: entry.denom || '', amount: entry.amount || '0' },
	]));
}

function extractAssets(pool, liquidity) {
	if (pool.token0 || pool.token1) {
		return { token1: pool.token0 || '', token2: pool.token1 || '' };
	}
	if (pool.poolAssets) {
		return Object.fromEntries(pool.poolAssets.map((asset, index) => [
			`token${index + 1}`,
			asset.token?.denom || '',
		]));
	}
	if (pool.poolLiquidity) {
		return Object.fromEntries(pool.poolLiquidity.map((asset, index) => [
			`token${index + 1}`,
			asset.denom || '',
		]));
	}
	return Object.fromEntries(Object.entries(liquidity).map(([key, entry]) => [key, entry.denom]));
}

export function normalizePool(pool, liquidityResponse) {
	const liquidity = normalizeLiquidity(liquidityResponse?.liquidity);
	return {
		type: poolType(pool['@type']),
		id: String(pool.id || pool.poolId || ''),
		address: pool.address || pool.contractAddress || '',
		assets: extractAssets(pool, liquidity),
		liquidity,
		fees: {
			swapFee: pool.spreadFactor || pool.poolParams?.swapFee || '',
			exitFee: pool.poolParams?.exitFee || '',
		},
	};
}

function hasLiquidity(pool) {
	return Object.keys(pool?.liquidity || {}).length > 0;
}

export function selectPoolUpdates(allPools, currentPools, mode) {
	if (mode === 'fresh') return allPools;
	const currentById = new Map(currentPools.map(pool => [String(pool.id), pool]));
	return allPools.filter(pool => !hasLiquidity(currentById.get(String(pool.id || pool.poolId))));
}
