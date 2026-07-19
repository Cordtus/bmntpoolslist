import { expect, test } from 'bun:test';
import { buildIbcCache, ibcHash } from '../ibc.js';

const atomTrace = {
	path: 'transfer/channel-0',
	baseDenom: 'uatom',
};

test('stores the IBC trace and direct source chain for a pool denom', async () => {
	const calls = [];
	const grpc = {
		paginate: async () => [atomTrace],
		call: async (service, method, request) => {
			calls.push({ service, method, request });
			if (method === 'Channel') return { channel: { connectionHops: ['connection-1'] } };
			if (method === 'Connection') return { connection: { clientId: '07-tendermint-1' } };
			if (method === 'ClientState') return { clientState: { chainId: 'cosmoshub-4' } };
			throw new Error(`unexpected ${method}`);
		},
	};

	const result = await buildIbcCache({
		pools: [{ id: '1', assets: { token1: 'ibc/27394FB092D2ECCD56123C74F36E4C1F926001CEADA9CA97EA622B25F41E5EB2' } }],
		denoms: {},
		channels: {},
		grpc,
	});

	expect(ibcHash(atomTrace)).toBe('27394FB092D2ECCD56123C74F36E4C1F926001CEADA9CA97EA622B25F41E5EB2');
	expect(result.denoms['27394FB092D2ECCD56123C74F36E4C1F926001CEADA9CA97EA622B25F41E5EB2']).toEqual({
		baseDenom: 'uatom',
		path: 'transfer/channel-0',
		channelIds: ['channel-0'],
		sourceChainId: 'cosmoshub-4',
	});
	expect(calls.map(call => call.method)).toEqual(['Channel', 'Connection', 'ClientState']);
});

test('does not query immutable IBC metadata already in the cache', async () => {
	const hash = ibcHash(atomTrace);
	const existing = {
		[hash]: {
			baseDenom: 'uatom',
			path: 'transfer/channel-0',
			channelIds: ['channel-0'],
			sourceChainId: 'cosmoshub-4',
		},
	};

	const result = await buildIbcCache({
		pools: [{ id: '1', assets: { token1: `ibc/${hash}` } }],
		denoms: existing,
		channels: { 'channel-0': { sourceChainId: 'cosmoshub-4' } },
		grpc: {
			paginate: async () => { throw new Error('cache hit must not fetch traces'); },
			call: async () => { throw new Error('cache hit must not fetch channels'); },
		},
	});

	expect(result.denoms).toEqual(existing);
});

test('retries an IBC metadata query until the gRPC request succeeds', async () => {
	let channelAttempts = 0;
	const grpc = {
		paginate: async () => [atomTrace],
		call: async (_service, method) => {
			if (method === 'Channel') {
				channelAttempts++;
				if (channelAttempts === 1) {
					const error = new Error('resource exhausted');
					error.code = 8;
					throw error;
				}
				return { channel: { connectionHops: ['connection-1'] } };
			}
			if (method === 'Connection') return { connection: { clientId: '07-tendermint-1' } };
			return { clientState: { chainId: 'cosmoshub-4' } };
		},
	};

	await buildIbcCache({
		pools: [{ id: '1', assets: { token1: `ibc/${ibcHash(atomTrace)}` } }],
		grpc,
		retryOptions: { random: () => 0, sleep: async () => {} },
	});

	expect(channelAttempts).toBe(2);
});

test('resolves independent uncached source channels concurrently', async () => {
	const osmoTrace = { path: 'transfer/channel-1', baseDenom: 'uosmo' };
	let activeChannels = 0;
	let maximumActiveChannels = 0;
	const grpc = {
		paginate: async () => [atomTrace, osmoTrace],
		call: async (_service, method, request) => {
			if (method === 'Channel') {
				activeChannels++;
				maximumActiveChannels = Math.max(maximumActiveChannels, activeChannels);
				await Bun.sleep(5);
				activeChannels--;
				return { channel: { connectionHops: [`connection-${request.channelId}`] } };
			}
			if (method === 'Connection') return { connection: { clientId: `client-${request.connectionId}` } };
			return { clientState: { chainId: 'counterparty-1' } };
		},
	};

	await buildIbcCache({
		pools: [{
			id: '1',
			assets: {
				token1: `ibc/${ibcHash(atomTrace)}`,
				token2: `ibc/${ibcHash(osmoTrace)}`,
			},
		}],
		grpc,
		retryOptions: { initialConcurrency: 2, maxConcurrency: 2 },
	});

	expect(maximumActiveChannels).toBe(2);
});

test('ignores malformed IBC-looking values instead of querying invalid hashes', async () => {
	const grpc = {
		paginate: async () => { throw new Error('malformed values must not fetch traces'); },
		call: async () => { throw new Error('malformed values must not fetch denom traces'); },
	};

	const result = await buildIbcCache({
		pools: [{
			id: '1175',
			assets: {
				token1: '{pool_asset_denoms:[ibc/8242AD24008032E457D2E12D46588FD39FB54FB29680C6C7663D296B383C37C4',
				token2: 'ibc/4ABBEF4C8926DDDB320AE5188CFD63267ABBCEFC0583E4AE05D6E5AA2401DDAB]',
			},
		}],
		grpc,
	});

	expect(result).toEqual({ denoms: {}, channels: {} });
});

test('caches a terminal missing trace once instead of retrying it forever', async () => {
	const hash = 'B61F272C20D301DD6D0C036BDCDF8CD83A95EE594FBDD9977910AE69F58936D3';
	let calls = 0;
	const grpc = {
		paginate: async () => [],
		call: async (_service, method, request) => {
			if (method !== 'DenomTrace') throw new Error(`unexpected ${method}`);
			calls++;
			expect(request.hash).toBe(hash);
			const error = new Error('denomination trace not found');
			error.code = 5;
			throw error;
		},
	};

	const result = await buildIbcCache({
		pools: [{ id: '1592', assets: { token1: `ibc/${hash.toLowerCase()}` } }],
		grpc,
	});

	expect(calls).toBe(1);
	expect(result.denoms[hash]).toEqual({
		baseDenom: null,
		path: null,
		channelIds: [],
		sourceChainId: null,
		resolution: 'not_found',
	});
});
