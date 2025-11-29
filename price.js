import { join } from 'path';

const cacheDir = join(import.meta.dir, 'data');
const assetCachePath = join(cacheDir, 'assetlist.json');
const priceCachePath = join(cacheDir, 'prices.json');

const ASSETLIST_URL = 'https://raw.githubusercontent.com/cosmos/chain-registry/master/osmosis/assetlist.json';
const COINGECKO_API = 'https://api.coingecko.com/api/v3/simple/price';
const CACHE_TTL = 5 * 60 * 1000; // 5 min for prices
const ASSET_CACHE_TTL = 24 * 60 * 60 * 1000; // 24h for assetlist

// Load or fetch assetlist from chain registry
async function loadAssetList() {
	const file = Bun.file(assetCachePath);
	if (await file.exists()) {
		try {
			const cached = await file.json();
			if (Date.now() - cached.timestamp < ASSET_CACHE_TTL) {
				return cached.data;
			}
		} catch {}
	}

	console.log('Fetching assetlist from chain registry...');
	const res = await fetch(ASSETLIST_URL);
	if (!res.ok) throw new Error(`Failed to fetch assetlist: ${res.status}`);
	const data = await res.json();

	await Bun.write(assetCachePath, JSON.stringify({ timestamp: Date.now(), data }, null, 2));
	return data;
}

// Build denom -> coingecko_id map
let denomToGeckoId = null;
let geckoIdToDecimals = null;

async function buildDenomMap() {
	if (denomToGeckoId) return;

	const assetlist = await loadAssetList();
	denomToGeckoId = {};
	geckoIdToDecimals = {};

	for (const asset of assetlist.assets || []) {
		const geckoId = asset.coingecko_id;
		if (!geckoId) continue;

		// Map base denom
		if (asset.base) {
			denomToGeckoId[asset.base.toLowerCase()] = geckoId;
		}

		// Find decimals from denom_units
		let decimals = 6;
		if (asset.denom_units) {
			const displayUnit = asset.denom_units.find(u => u.denom === asset.display);
			if (displayUnit?.exponent) decimals = displayUnit.exponent;
		}
		geckoIdToDecimals[geckoId] = decimals;
	}
}

// Get coingecko ID for a denom
export async function getGeckoId(denom) {
	await buildDenomMap();
	return denomToGeckoId[denom.toLowerCase()] || null;
}

// Get decimals for a gecko ID
export async function getDecimals(geckoId) {
	await buildDenomMap();
	return geckoIdToDecimals[geckoId] || 6;
}

// Price cache
let priceCache = { timestamp: 0, prices: {} };

async function loadPriceCache() {
	const file = Bun.file(priceCachePath);
	if (await file.exists()) {
		try {
			priceCache = await file.json();
		} catch {}
	}
}

async function savePriceCache() {
	await Bun.write(priceCachePath, JSON.stringify(priceCache, null, 2));
}

// Fetch prices for multiple coingecko IDs
export async function fetchPrices(geckoIds) {
	await loadPriceCache();

	const now = Date.now();
	const needsFetch = geckoIds.filter(id =>
		!priceCache.prices[id] || now - priceCache.timestamp > CACHE_TTL
	);

	if (needsFetch.length > 0) {
		const uniqueIds = [...new Set(needsFetch)].filter(Boolean);
		if (uniqueIds.length > 0) {
			try {
				const url = `${COINGECKO_API}?ids=${uniqueIds.join(',')}&vs_currencies=usd`;
				const res = await fetch(url);
				if (res.ok) {
					const data = await res.json();
					for (const [id, val] of Object.entries(data)) {
						priceCache.prices[id] = val.usd;
					}
					priceCache.timestamp = now;
					await savePriceCache();
				}
			} catch (err) {
				console.error('Price fetch error:', err.message);
			}
		}
	}

	return priceCache.prices;
}

// Get price for a denom
export async function getPrice(denom) {
	const geckoId = await getGeckoId(denom);
	if (!geckoId) return null;

	const prices = await fetchPrices([geckoId]);
	return prices[geckoId] || null;
}

// Calculate USD value for a denom amount
export async function calcUsdValue(denom, amount) {
	const geckoId = await getGeckoId(denom);
	if (!geckoId) return null;

	const prices = await fetchPrices([geckoId]);
	const price = prices[geckoId];
	if (!price) return null;

	const decimals = await getDecimals(geckoId);
	const value = (Number(amount) / Math.pow(10, decimals)) * price;
	return value;
}

// Format USD value
export function formatUsd(value) {
	if (value === null || value === undefined) return 'N/A';
	if (value < 0.01) return '<$0.01';
	if (value < 1000) return '$' + value.toFixed(2);
	if (value < 1000000) return '$' + (value / 1000).toFixed(2) + 'K';
	return '$' + (value / 1000000).toFixed(2) + 'M';
}

// Get all gecko IDs for a list of denoms
export async function getGeckoIdsForDenoms(denoms) {
	await buildDenomMap();
	const ids = [];
	for (const d of denoms) {
		const id = denomToGeckoId[d.toLowerCase()];
		if (id) ids.push(id);
	}
	return [...new Set(ids)];
}
