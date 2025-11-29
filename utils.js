import { join } from 'path';
import { restEndpoints, poolApiPath, config } from './config.js';

const dataDir = join(import.meta.dir, 'data');
const poolsPath = join(dataDir, 'pools.json');

// Ensure data directory exists using Bun native fs
export async function ensureDataDir() {
	const dir = Bun.file(dataDir);
	if (!await dir.exists()) {
		await Bun.write(join(dataDir, '.keep'), '');
		console.log(`Created data directory`);
	}
}

// Read pools file using Bun native APIs
export async function readPools() {
	await ensureDataDir();
	const file = Bun.file(poolsPath);
	if (await file.exists()) {
		try {
			return await file.json();
		} catch (err) {
			console.error('Failed to parse pools.json:', err.message);
			return { pools: [] };
		}
	}
	const init = { pools: [] };
	await writePools(init);
	return init;
}

// Write pools file using Bun native APIs
export async function writePools(data) {
	await Bun.write(poolsPath, JSON.stringify(data, null, 2));
}

// Fetch pool data with endpoint rotation
export async function fetchPool(poolId, endpointIdx = 0) {
	const endpoint = restEndpoints[endpointIdx];
	const url = `${endpoint}${poolApiPath(poolId)}`;

	const res = await fetch(url);
	if (!res.ok) {
		throw new Error(`HTTP ${res.status} from ${endpoint}`);
	}
	return res.json();
}

// Fetch with automatic endpoint rotation and retries
export async function fetchWithRetry(poolId) {
	let lastErr;
	for (let attempt = 0; attempt < config.maxRetries; attempt++) {
		const endpointIdx = attempt % restEndpoints.length;
		try {
			return await fetchPool(poolId, endpointIdx);
		} catch (err) {
			lastErr = err;
			console.error(`Attempt ${attempt + 1} failed for pool ${poolId}: ${err.message}`);
		}
	}
	throw lastErr;
}

// Delay helper using Bun.sleep
export const delay = (ms) => Bun.sleep(ms);
