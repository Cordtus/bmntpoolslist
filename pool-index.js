function normalize(value) {
	return String(value || '').toLowerCase();
}

function sortPoolIds(ids) {
	return [...ids].sort((a, b) => Number(a) - Number(b));
}

function add(map, key, poolId) {
	if (!key) return;
	const normalized = normalize(key);
	if (!map[normalized]) map[normalized] = new Set();
	map[normalized].add(String(poolId));
}

export function buildPoolIndex(pools, denoms = {}) {
	const entries = denoms.entries || denoms;
	const baseDenom = {};
	const channel = {};

	for (const pool of pools) {
		for (const denom of Object.values(pool.assets || {})) {
			add(baseDenom, denom, pool.id);
			if (!String(denom).startsWith('ibc/')) continue;

			const trace = entries[String(denom).slice(4)];
			if (!trace) continue;
			add(baseDenom, trace.baseDenom, pool.id);
			for (const channelId of trace.channelIds || []) {
				add(channel, channelId, pool.id);
			}
		}
	}

	return {
		baseDenom: Object.fromEntries(Object.entries(baseDenom).map(([key, ids]) => [key, sortPoolIds(ids)])),
		channel: Object.fromEntries(Object.entries(channel).map(([key, ids]) => [key, sortPoolIds(ids)])),
	};
}

export function findPoolIdsByBaseDenom(index, denom) {
	return index.baseDenom[normalize(denom)] || [];
}

export function findPoolIdsByChannel(index, channelId) {
	return index.channel[normalize(channelId)] || [];
}
