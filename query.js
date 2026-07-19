import { join } from 'path';
import { decodeIbcDenom, formatDenom } from './denom.js';
import { buildPoolIndex, findPoolIdsByBaseDenom, findPoolIdsByChannel } from './pool-index.js';
import { calcUsdValue, formatUsd, getGeckoIdsForDenoms, fetchPrices } from './price.js';

const poolsPath = join(import.meta.dir, 'data', 'pools.json');
const denomsPath = join(import.meta.dir, 'data', 'denoms.json');
const poolIndexPath = join(import.meta.dir, 'data', 'pool-index.json');

// Load pools data
async function loadPools() {
	const file = Bun.file(poolsPath);
	if (await file.exists()) {
		return (await file.json()).pools || [];
	}
	return [];
}

async function loadJson(path, fallback) {
	const file = Bun.file(path);
	if (!await file.exists()) return fallback;
	try {
		return await file.json();
	} catch {
		return fallback;
	}
}

async function loadPoolIndex(pools) {
	const index = await loadJson(poolIndexPath, null);
	if (index?.baseDenom && index?.channel) return index;
	const denoms = await loadJson(denomsPath, {});
	return buildPoolIndex(pools, denoms);
}

function poolsForIds(pools, ids) {
	const byId = new Map(pools.map((pool) => [String(pool.id), pool]));
	return ids.map((id) => byId.get(String(id))).filter(Boolean);
}

export function findPoolsByBaseDenom(pools, index, baseDenom) {
	return poolsForIds(pools, findPoolIdsByBaseDenom(index, baseDenom));
}

export function findPoolsByChannel(pools, index, channelId) {
	return poolsForIds(pools, findPoolIdsByChannel(index, channelId));
}

// Find pools by their raw or IBC-decoded base denom without a network call.
export async function findByBaseDenom(baseDenom) {
	const pools = await loadPools();
	return findPoolsByBaseDenom(pools, await loadPoolIndex(pools), baseDenom);
}

// Find pools whose IBC trace includes a specific channel without a network call.
export async function findByChannel(channelId) {
	const pools = await loadPools();
	return findPoolsByChannel(pools, await loadPoolIndex(pools), channelId);
}

// Get all assets from a pool as array
function getPoolAssets(pool) {
	return Object.values(pool.assets || {});
}

// Check if pool contains a specific denom (exact or partial match)
function poolHasAsset(pool, searchTerm, exact = false) {
	const assets = getPoolAssets(pool);
	const term = searchTerm.toLowerCase();
	return assets.some(asset => {
		const a = asset.toLowerCase();
		return exact ? a === term : a.includes(term);
	});
}

// Find pools containing a specific asset
export async function findByAsset(searchTerm, exact = false) {
	const pools = await loadPools();
	return pools.filter(p => poolHasAsset(p, searchTerm, exact));
}

// Find pools containing ALL specified assets
export async function findByAssets(searchTerms, exact = false) {
	const pools = await loadPools();
	return pools.filter(pool =>
		searchTerms.every(term => poolHasAsset(pool, term, exact))
	);
}

// Find pools containing ANY of the specified assets
export async function findByAnyAsset(searchTerms, exact = false) {
	const pools = await loadPools();
	return pools.filter(pool =>
		searchTerms.some(term => poolHasAsset(pool, term, exact))
	);
}

// Get pool by ID
export async function getPool(poolId) {
	const pools = await loadPools();
	return pools.find(p => p.id === String(poolId));
}

// Decode all assets in a pool
export async function decodePoolAssets(pool) {
	const assets = getPoolAssets(pool);
	const decoded = {};
	for (const [key, denom] of Object.entries(pool.assets)) {
		const info = await decodeIbcDenom(denom);
		decoded[key] = {
			raw: denom,
			...info,
			display: formatDenom(info),
		};
	}
	return { ...pool, decodedAssets: decoded };
}

// Format amount with human-readable units
function formatAmount(amount, denom) {
	const num = BigInt(amount || '0');
	// Most cosmos denoms use 6 decimals (uatom, uosmo, etc.)
	const decimals = denom?.startsWith('u') || denom?.includes('/u') ? 6 :
		denom?.includes('wei') || denom?.includes('ETH') ? 18 : 6;
	const divisor = BigInt(10 ** decimals);
	const whole = num / divisor;
	const frac = num % divisor;
	if (whole > 1000000n) {
		return `${(Number(whole) / 1000000).toFixed(2)}M`;
	} else if (whole > 1000n) {
		return `${(Number(whole) / 1000).toFixed(2)}K`;
	}
	return whole.toString();
}

// Format pool for display (sync version without USD)
export function formatPool(pool, decoded = false) {
	const lines = [
		`Pool #${pool.id} (${pool.type})`,
		`  Address: ${pool.address}`,
		`  Assets:`,
	];

	if (decoded && pool.decodedAssets) {
		for (const [key, asset] of Object.entries(pool.decodedAssets)) {
			const liq = pool.liquidity?.[key];
			const liqStr = liq ? ` [${formatAmount(liq.amount, liq.denom)}]` : '';
			lines.push(`    ${key}: ${asset.display}${liqStr}`);
		}
	} else {
		for (const [key, denom] of Object.entries(pool.assets)) {
			const liq = pool.liquidity?.[key];
			const liqStr = liq ? ` [${formatAmount(liq.amount, liq.denom)}]` : '';
			lines.push(`    ${key}: ${denom}${liqStr}`);
		}
	}

	if (pool.fees?.swapFee) {
		const fee = parseFloat(pool.fees.swapFee) * 100;
		lines.push(`  Swap Fee: ${fee.toFixed(2)}%`);
	}

	return lines.join('\n');
}

// Format pool with USD values (async)
export async function formatPoolWithUsd(pool, decoded = false) {
	// Prefetch prices for all assets in pool
	const denoms = Object.values(pool.liquidity || {}).map(l => l.denom).filter(Boolean);
	const geckoIds = await getGeckoIdsForDenoms(denoms);
	if (geckoIds.length > 0) await fetchPrices(geckoIds);

	const lines = [
		`Pool #${pool.id} (${pool.type})`,
		`  Address: ${pool.address}`,
		`  Assets:`,
	];

	let totalUsd = 0;

	if (decoded && pool.decodedAssets) {
		for (const [key, asset] of Object.entries(pool.decodedAssets)) {
			const liq = pool.liquidity?.[key];
			let liqStr = '';
			let usdStr = '';
			if (liq) {
				liqStr = ` [${formatAmount(liq.amount, liq.denom)}]`;
				const usdVal = await calcUsdValue(liq.denom, liq.amount);
				if (usdVal !== null) {
					totalUsd += usdVal;
					usdStr = ` (${formatUsd(usdVal)})`;
				}
			}
			lines.push(`    ${key}: ${asset.display}${liqStr}${usdStr}`);
		}
	} else {
		for (const [key, denom] of Object.entries(pool.assets)) {
			const liq = pool.liquidity?.[key];
			let liqStr = '';
			let usdStr = '';
			if (liq) {
				liqStr = ` [${formatAmount(liq.amount, liq.denom)}]`;
				const usdVal = await calcUsdValue(liq.denom, liq.amount);
				if (usdVal !== null) {
					totalUsd += usdVal;
					usdStr = ` (${formatUsd(usdVal)})`;
				}
			}
			lines.push(`    ${key}: ${denom}${liqStr}${usdStr}`);
		}
	}

	if (totalUsd > 0) {
		lines.push(`  Total TVL: ${formatUsd(totalUsd)}`);
	}

	if (pool.fees?.swapFee) {
		const fee = parseFloat(pool.fees.swapFee) * 100;
		lines.push(`  Swap Fee: ${fee.toFixed(2)}%`);
	}

	return lines.join('\n');
}

// Get pool TVL in USD
export async function getPoolTvl(pool) {
	let totalUsd = 0;
	for (const [key, liq] of Object.entries(pool.liquidity || {})) {
		if (liq?.denom && liq?.amount) {
			const usdVal = await calcUsdValue(liq.denom, liq.amount);
			if (usdVal !== null) totalUsd += usdVal;
		}
	}
	return totalUsd;
}

// Compatibility alias for the former CLI command. This remains fully offline.
export async function searchByBaseDenom(baseDenom) {
	return findByBaseDenom(baseDenom);
}
