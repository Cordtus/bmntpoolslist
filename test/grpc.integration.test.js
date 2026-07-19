import { expect, test } from 'bun:test';
import { grpcEndpoints } from '../config.js';
import { GrpcClient } from '../grpc.js';
import { retryForever } from '../retry.js';

const runLiveGrpc = process.env.RUN_LIVE_GRPC === '1';

test.skipIf(!runLiveGrpc)('loads live pool definitions through the primary and failover gRPC endpoints', async () => {
	const client = new GrpcClient(grpcEndpoints);
	try {
		const response = await retryForever(
			() => client.call('osmosis.poolmanager.v1beta1.Query', 'AllPools', {}),
			{ initialDelayMs: 100, maxDelayMs: 1_000 },
		);
		expect(response.pools.length).toBeGreaterThan(3_000);
		expect(response.pools[0]['@type']).toStartWith('/osmosis.');
	} finally {
		client.close();
	}
}, 120_000);
