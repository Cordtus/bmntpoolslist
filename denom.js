import { join } from 'path';

const denomCachePath = join(import.meta.dir, 'data', 'denoms.json');
let denomCache;

async function loadCache() {
	if (denomCache) return denomCache;
	const file = Bun.file(denomCachePath);
	if (!await file.exists()) {
		denomCache = {};
		return denomCache;
	}
	try {
		const data = await file.json();
		denomCache = data.entries || data;
	} catch {
		denomCache = {};
	}
	return denomCache;
}

export function decodeIbcDenomFromCache(denom, cache) {
	if (!denom.startsWith('ibc/')) return { denom, isIbc: false };
	const hash = denom.slice(4);
	const entries = cache?.entries || cache || {};
	const trace = entries[hash];
	if (!trace) {
		return { denom, isIbc: true, baseDenom: null, path: null, channelIds: [], sourceChainId: null };
	}
	return { denom, isIbc: true, ...trace };
}

export async function decodeIbcDenom(denom) {
	return decodeIbcDenomFromCache(denom, await loadCache());
}

export async function decodeMultiple(denoms) {
	const cache = await loadCache();
	return Object.fromEntries(denoms.map(denom => [denom, decodeIbcDenomFromCache(denom, cache)]));
}

export function parseIbcPath(path) {
	if (!path) return [];
	const parts = path.split('/');
	const channels = [];
	for (let index = 0; index < parts.length; index += 2) {
		if (parts[index] === 'transfer' && parts[index + 1]) channels.push(parts[index + 1]);
	}
	return channels;
}

export function formatDenom(decoded) {
	if (!decoded.isIbc || !decoded.baseDenom) return decoded.denom;
	const channels = decoded.channelIds?.length ? decoded.channelIds : parseIbcPath(decoded.path);
	return channels.length > 0
		? `${decoded.baseDenom} (${channels.join(' -> ')})`
		: decoded.baseDenom;
}
