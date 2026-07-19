// Public Osmosis gRPC endpoints. The client rotates after a transport or gRPC error.
export const grpcEndpoints = [
	// Polkachú exposes h2c gRPC here, so this endpoint must remain HTTP/plaintext.
	'http://osmosis-grpc.polkachu.com:12590',
	'https://osmosis.lavenderfive.com:443',
	'https://osmosis.grpc.stakin-nodes.com:443',
	'https://osmosis-grpc.publicnode.com:443',
	'https://grpc.osmosis.validatus.com:443',
	'https://grpc.osmosis.citizenweb3.com:443',
];

export const config = {
	requestTimeoutMs: 30_000,
	initialConcurrency: 24,
	maxConcurrency: 24,
	minConcurrency: 1,
	initialDelayMs: 500,
	maxDelayMs: 60_000,
	checkpointInterval: 25,
};
