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
