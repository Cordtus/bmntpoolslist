// REST API endpoints for Osmosis pool data
export const restEndpoints = [
	'https://rest-osmosis.ecostake.com',
	'https://osmosis-api.lavenderfive.com:443',
	'https://osmosis-lcd.quickapi.com:443',
	'https://lcd.osmosis.zone',
];

// API path template
export const poolApiPath = (poolId) => `/osmosis/poolmanager/v1beta1/pools/${poolId}`;

// Retry and delay configuration
export const config = {
	maxRetries: 5,
	requestDelayMs: 500,
	shortWaitMs: 300000,      // 5 minutes
	longWaitMs: 21600000,     // 6 hours
	shortWaitThreshold: 10,   // consecutive failures before short wait
	shortWaitMaxCount: 3,     // short waits before long wait
};

// Pool type identifiers
export const poolTypes = {
	concentrated: 'concentratedliquidity',
	gamm: 'gamm',
	cosmwasm: 'cosmwasmpool',
	stableswap: 'stableswap',
};
