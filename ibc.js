import { createHash } from 'node:crypto';
import { collectWithAdaptiveConcurrency } from './collector.js';
import { retryForever } from './retry.js';

export function ibcHash({ path, baseDenom }) {
	return createHash('sha256')
		.update(`${path}/${baseDenom}`)
		.digest('hex')
		.toUpperCase();
}

export function parseChannelIds(path) {
	const parts = String(path || '').split('/');
	const channels = [];
	for (let index = 0; index < parts.length; index += 2) {
		if (parts[index] === 'transfer' && parts[index + 1]) {
			channels.push(parts[index + 1]);
		}
	}
	return channels;
}

function traceEntries(cache) {
	return cache?.entries || cache || {};
}

function collectIbcHashes(pools) {
	const hashes = new Set();
	for (const pool of pools) {
		const denoms = [
			...Object.values(pool.assets || {}),
			...Object.values(pool.liquidity || {}).map(entry => entry?.denom),
		];
		for (const denom of denoms) {
			if (String(denom).startsWith('ibc/')) hashes.add(String(denom).slice(4));
		}
	}
	return hashes;
}

async function resolveSourceChain(channelId, channels, grpc) {
	if (channels[channelId]) return channels[channelId];

	const channelResponse = await grpc.call('ibc.core.channel.v1.Query', 'Channel', {
		portId: 'transfer',
		channelId,
	});
	const connectionId = channelResponse.channel?.connectionHops?.[0];
	if (!connectionId) {
		return { sourceChainId: null };
	}

	const connectionResponse = await grpc.call('ibc.core.connection.v1.Query', 'Connection', {
		connectionId,
	});
	const clientId = connectionResponse.connection?.clientId;
	if (!clientId) {
		return { sourceChainId: null, connectionId };
	}

	const clientResponse = await grpc.call('ibc.core.client.v1.Query', 'ClientState', {
		clientId,
	});
	return {
		sourceChainId: clientResponse.clientState?.chainId || null,
		connectionId,
		clientId,
	};
}

export async function buildIbcCache({ pools, denoms = {}, channels = {}, grpc, retryOptions }) {
	const cachedDenoms = { ...traceEntries(denoms) };
	const cachedChannels = { ...traceEntries(channels) };
	const missingHashes = [...collectIbcHashes(pools)].filter(hash => !cachedDenoms[hash]);

	if (missingHashes.length === 0) {
		return { denoms: cachedDenoms, channels: cachedChannels };
	}

	const traces = await retryForever(() => grpc.paginate(
		'ibc.applications.transfer.v1.Query',
		'DenomTraces',
		'denomTraces',
	), retryOptions);
	const tracesByHash = Object.fromEntries(traces.map(trace => [ibcHash(trace), trace]));
	const tracesForMissingHashes = await collectWithAdaptiveConcurrency(missingHashes, async hash => {
		const trace = tracesByHash[hash] || (await grpc.call(
			'ibc.applications.transfer.v1.Query',
			'DenomTrace',
			{ hash },
		)).denomTrace;
		if (!trace) throw new Error(`IBC denom trace ${hash} was not found`);
		return { hash, trace };
	}, retryOptions);

	const sourceChannelIds = [...new Set(tracesForMissingHashes
		.map(({ trace }) => parseChannelIds(trace.path)[0])
		.filter(channelId => channelId && !cachedChannels[channelId]))];
	const sources = await collectWithAdaptiveConcurrency(sourceChannelIds, channelId => (
		resolveSourceChain(channelId, cachedChannels, grpc)
	), retryOptions);
	for (let index = 0; index < sourceChannelIds.length; index++) {
		cachedChannels[sourceChannelIds[index]] = sources[index];
	}

	for (const { hash, trace } of tracesForMissingHashes) {
		const channelIds = parseChannelIds(trace.path);
		const sourceChannelId = channelIds[0];
		const source = sourceChannelId ? cachedChannels[sourceChannelId] : { sourceChainId: null };

		cachedDenoms[hash] = {
			baseDenom: trace.baseDenom,
			path: trace.path,
			channelIds,
			sourceChainId: source.sourceChainId,
		};
	}

	return { denoms: cachedDenoms, channels: cachedChannels };
}
