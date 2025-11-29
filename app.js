import { config, poolTypes } from './config.js';
import { readPools, writePools, fetchWithRetry, fetchLiquidityWithRetry, delay } from './utils.js';

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
			if (pool.pool_liquidity) {
				pool.pool_liquidity.forEach((asset, i) => {
					assets[`token${i + 1}`] = asset.denom || '';
				});
			}
			break;

		case poolTypes.gamm:
			if (pool.pool_assets) {
				pool.pool_assets.forEach((asset, i) => {
					assets[`token${i + 1}`] = asset.token?.denom || '';
				});
			}
			break;

		case poolTypes.cosmwasm:
			if (pool.tokens) {
				pool.tokens.forEach((token, i) => {
					assets[`token${i + 1}`] = token || '';
				});
			}
			break;
	}

	return assets;
}

// Parse liquidity response into denom -> amount map
function parseLiquidity(liquidityData) {
	const liquidity = {};
	if (liquidityData?.liquidity) {
		liquidityData.liquidity.forEach((item, i) => {
			liquidity[`token${i + 1}`] = {
				denom: item.denom || '',
				amount: item.amount || '0',
			};
		});
	}
	return liquidity;
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
function formatPool(poolData, liquidityData) {
	const pool = poolData.pool;
	const type = getPoolType(pool['@type'] || '');
	const assets = extractAssets(pool, type);
	const liquidity = parseLiquidity(liquidityData);

	return {
		type,
		id: pool.id || '',
		address: pool.address || pool.contract_address || '',
		assets,
		liquidity,
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
			// Fetch pool data and liquidity in parallel
			const [poolResponse, liquidityResponse] = await Promise.all([
				fetchWithRetry(poolId),
				fetchLiquidityWithRetry(poolId),
			]);

			if (poolResponse?.pool) {
				const formatted = formatPool(poolResponse, liquidityResponse);
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
