// REST API endpoints for Osmosis pool data
export const restEndpoints = [
	'https://lcd.osmosis.zone',
	'https://rest.lavenderfive.com:443/osmosis',
	'https://rest-osmosis.ecostake.com',
	'https://osmosis-api.polkachu.com',
	'https://rest.osmosis.goldenratiostaking.net',
];

// API path template
export const poolApiPath = (poolId) => `/osmosis/poolmanager/v1beta1/pools/${poolId}`;

// Retry and delay configuration
export const config = {
	maxRetries: 5,
	requestDelayMs: 100,      // fast iteration with multiple endpoints
	shortWaitMs: 60000,       // 1 minute
	longWaitMs: 300000,       // 5 minutes
	shortWaitThreshold: 15,   // consecutive failures before short wait
	shortWaitMaxCount: 3,     // short waits before long wait
};

// Pool type identifiers
export const poolTypes = {
	concentrated: 'concentratedliquidity',
	gamm: 'gamm',
	cosmwasm: 'cosmwasmpool',
	stableswap: 'stableswap',
};
