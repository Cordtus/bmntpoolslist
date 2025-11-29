import { join } from 'path';

const denomCachePath = join(import.meta.dir, 'data', 'denoms.json');

// In-memory cache for denom lookups
let denomCache = null;

// Load denom cache from disk
async function loadCache() {
	if (denomCache) return denomCache;
	const file = Bun.file(denomCachePath);
	if (await file.exists()) {
		try {
			denomCache = await file.json();
		} catch {
			denomCache = {};
		}
	} else {
		denomCache = {};
	}
	return denomCache;
}

// Save denom cache to disk
async function saveCache() {
	if (denomCache) {
		await Bun.write(denomCachePath, JSON.stringify(denomCache, null, 2));
	}
}

// Decode IBC denom hash to trace info
export async function decodeIbcDenom(denom) {
	if (!denom.startsWith('ibc/')) return { denom, isIbc: false };

	const cache = await loadCache();
	const hash = denom.slice(4);

	if (cache[hash]) {
		return { denom, isIbc: true, ...cache[hash] };
	}

	// Query Osmosis REST API for denom trace
	const endpoints = [
		'https://rest-osmosis.ecostake.com',
		'https://lcd.osmosis.zone',
	];

	for (const endpoint of endpoints) {
		try {
			const url = `${endpoint}/ibc/apps/transfer/v1/denom_traces/${hash}`;
			const res = await fetch(url);
			if (!res.ok) continue;

			const data = await res.json();
			if (data.denom_trace) {
				const trace = {
					baseDenom: data.denom_trace.base_denom,
					path: data.denom_trace.path,
				};
				cache[hash] = trace;
				await saveCache();
				return { denom, isIbc: true, ...trace };
			}
		} catch {
			continue;
		}
	}

	return { denom, isIbc: true, baseDenom: null, path: null };
}

// Decode multiple denoms in parallel
export async function decodeMultiple(denoms) {
	const results = await Promise.all(denoms.map(decodeIbcDenom));
	return Object.fromEntries(results.map(r => [r.denom, r]));
}

// Extract chain from IBC path (e.g., "transfer/channel-0" -> channel info)
export function parseIbcPath(path) {
	if (!path) return null;
	const parts = path.split('/');
	const channels = [];
	for (let i = 0; i < parts.length; i += 2) {
		if (parts[i] === 'transfer' && parts[i + 1]) {
			channels.push(parts[i + 1]);
		}
	}
	return channels;
}

// Get human-readable denom name
export function formatDenom(decoded) {
	if (!decoded.isIbc) return decoded.denom;
	if (!decoded.baseDenom) return decoded.denom;
	const channels = parseIbcPath(decoded.path);
	if (channels?.length === 1) {
		return `${decoded.baseDenom} (${channels[0]})`;
	}
	if (channels?.length > 1) {
		return `${decoded.baseDenom} (${channels.join(' -> ')})`;
	}
	return decoded.baseDenom;
}
