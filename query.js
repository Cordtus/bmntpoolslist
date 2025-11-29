import { join } from 'path';
import { decodeIbcDenom, formatDenom } from './denom.js';

const poolsPath = join(import.meta.dir, 'data', 'pools.json');

// Load pools data
async function loadPools() {
	const file = Bun.file(poolsPath);
	if (await file.exists()) {
		return (await file.json()).pools || [];
	}
	return [];
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

// Format pool for display
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

// Search with decoded denom matching
export async function searchByBaseDenom(baseDenom) {
	const pools = await loadPools();
	const results = [];

	for (const pool of pools) {
		const assets = getPoolAssets(pool);
		for (const asset of assets) {
			if (asset.toLowerCase().includes(baseDenom.toLowerCase())) {
				results.push(pool);
				break;
			}
			if (asset.startsWith('ibc/')) {
				const decoded = await decodeIbcDenom(asset);
				if (decoded.baseDenom?.toLowerCase().includes(baseDenom.toLowerCase())) {
					results.push(pool);
					break;
				}
			}
		}
	}

	return results;
}
