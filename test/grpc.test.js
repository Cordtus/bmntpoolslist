import { expect, test } from 'bun:test';
import { extractHttpStatus, extractRetryAfterMs, orderFileDescriptors, paginateRpc, reflectedSymbols } from '../grpc.js';
import { isRateLimited } from '../retry.js';

test('uses a pagination key until the gRPC response is exhausted', async () => {
	const requests = [];
	const call = async (_service, _method, request) => {
		requests.push(request);
		if (requests.length === 1) {
			return {
			denomTraces: [{ baseDenom: 'uatom' }],
			pagination: { nextKey: 'AQI=' },
		};
		}
		return {
			denomTraces: [{ baseDenom: 'uosmo' }],
			pagination: { nextKey: '' },
		};
	};

	const traces = await paginateRpc(call, 'ibc.applications.transfer.v1.Query', 'DenomTraces', 'denomTraces', 1000);

	expect(traces).toEqual([{ baseDenom: 'uatom' }, { baseDenom: 'uosmo' }]);
	expect(requests[0]).toEqual({ pagination: { limit: 1000n } });
	expect([...requests[1].pagination.key]).toEqual([1, 2]);
});

test('converts a retry-after response header to milliseconds', () => {
	const error = { metadata: new Headers({ 'retry-after': '3' }) };

	expect(extractRetryAfterMs(error)).toBe(3000);
});

test('classifies a gRPC transport HTTP 429 as rate limited', () => {
	const error = { code: 14, rawMessage: 'HTTP 429' };

	expect(extractHttpStatus(error)).toBe(429);
	error.status = extractHttpStatus(error);
	expect(isRateLimited(error)).toBe(true);
});

test('orders reflected descriptor dependencies before their importers', () => {
	const files = new Map([
		['osmosis/poolmanager/v1beta1/query.proto', {
			name: 'osmosis/poolmanager/v1beta1/query.proto',
			dependency: ['gogoproto/gogo.proto'],
		}],
		['gogoproto/gogo.proto', {
			name: 'gogoproto/gogo.proto',
			dependency: ['google/protobuf/descriptor.proto'],
		}],
		['google/protobuf/descriptor.proto', {
			name: 'google/protobuf/descriptor.proto',
			dependency: [],
		}],
	]);

	expect(orderFileDescriptors(files).map((file) => file.name)).toEqual([
		'google/protobuf/descriptor.proto',
		'gogoproto/gogo.proto',
		'osmosis/poolmanager/v1beta1/query.proto',
	]);
});

test('reflects every concrete pool type returned in pool-manager Any values', () => {
	expect(reflectedSymbols).toEqual(expect.arrayContaining([
		'osmosis.gamm.v1beta1.Pool',
		'osmosis.gamm.poolmodels.stableswap.v1beta1.Pool',
		'osmosis.concentratedliquidity.v1beta1.Pool',
		'osmosis.cosmwasmpool.v1beta1.CosmWasmPool',
	]));
});
