import { join } from 'path';

const dataDir = join(import.meta.dir, 'data');
const poolsPath = join(dataDir, 'pools.json');

export async function ensureDataDir() {
	const dir = Bun.file(dataDir);
	if (!await dir.exists()) {
		await Bun.write(join(dataDir, '.keep'), '');
	}
}

export async function readPools() {
	await ensureDataDir();
	const file = Bun.file(poolsPath);
	if (!await file.exists()) return { pools: [] };
	try {
		return await file.json();
	} catch (error) {
		console.error('Failed to parse pools.json:', error.message);
		return { pools: [] };
	}
}

export async function writePools(data) {
	await ensureDataDir();
	await Bun.write(poolsPath, JSON.stringify(data, null, 2));
}

export const delay = ms => Bun.sleep(ms);
