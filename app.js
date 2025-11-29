import { config, poolTypes } from './config.js';
import { readPools, writePools, fetchWithRetry, delay } from './utils.js';

// Detect pool type from @type field
function getPoolType(typeStr) {
	if (typeStr.includes(poolTypes.concentrated)) return poolTypes.concentrated;
	if (typeStr.includes(poolTypes.stableswap)) return poolTypes.stableswap;
	if (typeStr.includes(poolTypes.cosmwasm)) return poolTypes.cosmwasm;
	if (typeStr.includes(poolTypes.gamm)) return poolTypes.gamm;
	return 'unknown';
}

// Extract assets based on pool type
function extractAssets(pool, type) {
	const assets = {};

	switch (type) {
		case poolTypes.concentrated:
			assets.token1 = pool.token0 || '';
			assets.token2 = pool.token1 || '';
			break;

		case poolTypes.stableswap:
		case poolTypes.gamm:
			if (pool.pool_liquidity) {
				pool.pool_liquidity.forEach((asset, i) => {
					assets[`token${i + 1}`] = asset.denom || '';
				});
			} else if (pool.pool_assets) {
				pool.pool_assets.forEach((asset, i) => {
					assets[`token${i + 1}`] = asset.token?.denom || '';
				});
			}
			break;

		case poolTypes.cosmwasm:
			// CosmWasm pools may have different structures
			if (pool.tokens) {
				pool.tokens.forEach((token, i) => {
					assets[`token${i + 1}`] = token || '';
				});
			}
			break;
	}

	return assets;
}

// Extract fees based on pool type
function extractFees(pool, type) {
	const fees = { swapFee: '', exitFee: '' };

	switch (type) {
		case poolTypes.concentrated:
			fees.swapFee = pool.spread_factor || '';
			break;

		case poolTypes.stableswap:
			fees.swapFee = pool.pool_params?.swap_fee || '';
			fees.exitFee = pool.pool_params?.exit_fee || '';
			break;

		case poolTypes.gamm:
			fees.swapFee = pool.pool_params?.swap_fee || '';
			fees.exitFee = pool.pool_params?.exit_fee || '';
			break;

		case poolTypes.cosmwasm:
			// CosmWasm pools handle fees differently
			break;
	}

	return fees;
}

// Normalize pool data into consistent format
function formatPool(data) {
	const pool = data.pool;
	const type = getPoolType(pool['@type'] || '');

	return {
		type,
		id: pool.id || '',
		address: pool.address || pool.contract_address || '',
		assets: extractAssets(pool, type),
		fees: extractFees(pool, type),
	};
}

// Main collection loop
async function collectPools() {
	const data = await readPools();
	let poolId = data.pools.length > 0
		? parseInt(data.pools[data.pools.length - 1].id) + 1
		: 1;

	console.log(`Starting from pool ID ${poolId}`);

	let consecutiveFailures = 0;
	let shortWaitCount = 0;

	while (true) {
		try {
			const response = await fetchWithRetry(poolId);

			if (response?.pool) {
				const formatted = formatPool(response);
				data.pools.push(formatted);
				await writePools(data);
				console.log(`Saved pool ${poolId} (${formatted.type})`);
				poolId++;
				consecutiveFailures = 0;
			} else {
				throw new Error('No pool data in response');
			}
		} catch (err) {
			console.error(`Failed pool ${poolId}: ${err.message}`);
			consecutiveFailures++;

			// Skip pool after max retries
			if (consecutiveFailures >= config.maxRetries) {
				console.log(`Skipping pool ${poolId}`);
				poolId++;
				consecutiveFailures = 0;
			}

			// Backoff on repeated failures
			if (consecutiveFailures >= config.shortWaitThreshold) {
				if (shortWaitCount >= config.shortWaitMaxCount) {
					console.log('Long wait (6 hours)...');
					await delay(config.longWaitMs);
					shortWaitCount = 0;
				} else {
					console.log('Short wait (5 minutes)...');
					await delay(config.shortWaitMs);
					shortWaitCount++;
				}
			}
		}

		await delay(config.requestDelayMs);
	}
}

// Entry point
collectPools().catch(err => {
	console.error('Fatal error:', err);
	process.exit(1);
});
