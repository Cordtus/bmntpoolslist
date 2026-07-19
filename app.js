import { mkdir, rename } from 'node:fs/promises';
import { join } from 'path';
import { config, grpcEndpoints } from './config.js';
import { collectWithAdaptiveConcurrency, normalizePool, refreshPoolMetadata, selectPoolUpdates } from './collector.js';
import { GrpcClient } from './grpc.js';
import { buildIbcCache } from './ibc.js';
import { resolveCollectionMode } from './mode.js';
import { buildPoolIndex } from './pool-index.js';
import { retryForever } from './retry.js';

const dataDir = join(import.meta.dir, 'data');
const paths = {
	pools: join(dataDir, 'pools.json'),
	pendingPools: join(dataDir, 'pools.pending.json'),
	denoms: join(dataDir, 'denoms.json'),
	channels: join(dataDir, 'channels.json'),
	poolIndex: join(dataDir, 'pool-index.json'),
	state: join(dataDir, 'collection-state.json'),
};

async function readJson(path, fallback) {
	const file = Bun.file(path);
	if (!await file.exists()) return fallback;
	try {
		return await file.json();
	} catch (error) {
		console.error(`Ignoring unreadable ${path}: ${error.message}`);
		return fallback;
	}
}

async function writeJsonAtomically(path, value) {
	await mkdir(dataDir, { recursive: true });
	const temporaryPath = `${path}.${process.pid}.tmp`;
	await Bun.write(temporaryPath, JSON.stringify(value, null, 2));
	await rename(temporaryPath, path);
}

function orderedPools(poolsById) {
	return [...poolsById.values()].sort((left, right) => Number(left.id) - Number(right.id));
}

async function promptForMode() {
	if (!process.stdin.isTTY) {
		throw new Error('Choose --mode fresh or --mode partial when stdin is not interactive.');
	}
	process.stdout.write('Collection mode: fresh snapshot or partial update? [fresh/partial] ');
	for await (const chunk of process.stdin) return String(chunk);
	return '';
}

function retryReporter(label) {
	return ({ attempt, error, delayMs }) => {
		console.error(`${label} failed (${error.message}); retry ${attempt + 1} in ${Math.ceil(delayMs / 1_000)}s`);
	};
}

export async function collectPools(mode, grpc) {
	await mkdir(dataDir, { recursive: true });
	const current = await readJson(paths.pools, { pools: [] });
	const previousState = await readJson(paths.state, {});
	const pending = await readJson(paths.pendingPools, { pools: [] });
	const resumingFreshSnapshot = mode === 'fresh' && previousState.mode === 'fresh' && !previousState.complete && pending.pools.length > 0;
	const seedPools = resumingFreshSnapshot ? pending.pools : current.pools;
	const selectionMode = resumingFreshSnapshot ? 'partial' : mode;

	console.log('Loading pool definitions through gRPC...');
	const response = await retryForever(
		() => grpc.call('osmosis.poolmanager.v1beta1.Query', 'AllPools', {}),
		{ ...config, onRetry: retryReporter('AllPools') },
	);
	const allPools = response.pools || [];
	const refreshedPools = selectionMode === 'partial'
		? refreshPoolMetadata(allPools, seedPools)
		: [];
	const completeSeedPools = previousState.complete
		? refreshedPools.map(pool => ({ ...pool, liquidityComplete: true }))
		: refreshedPools;
	const workingPools = new Map(completeSeedPools.map(pool => [String(pool.id), pool]));
	const targets = selectPoolUpdates(allPools, completeSeedPools, selectionMode);
	console.log(`Collecting liquidity for ${targets.length} of ${allPools.length} pools...`);

	let completedSinceStart = 0;
	let checkpoint = Promise.resolve();
	const checkpointProgress = () => {
		checkpoint = checkpoint.then(async () => {
			const pools = orderedPools(workingPools);
			await writeJsonAtomically(paths.pendingPools, { pools });
			await writeJsonAtomically(paths.state, {
				mode,
				complete: false,
				updatedAt: new Date().toISOString(),
				completedPools: pools.length,
			});
		});
		return checkpoint;
	};

	await collectWithAdaptiveConcurrency(targets, async rawPool => {
		const poolId = rawPool.id || rawPool.poolId;
		const liquidity = await grpc.call(
			'osmosis.poolmanager.v1beta1.Query',
			'TotalPoolLiquidity',
			{ poolId: BigInt(poolId) },
		);
		return normalizePool(rawPool, liquidity);
	}, {
		...config,
		onRetry: retryReporter('Pool liquidity'),
		onResult: async pool => {
			workingPools.set(pool.id, pool);
			completedSinceStart++;
			if (completedSinceStart % config.checkpointInterval === 0) await checkpointProgress();
		},
	});
	await checkpoint;

	const pools = orderedPools(workingPools);
	const denomDocument = await readJson(paths.denoms, { entries: {} });
	const channelDocument = await readJson(paths.channels, { entries: {} });
	console.log('Updating immutable IBC trace and source-chain caches through gRPC...');
	const ibc = await buildIbcCache({
		pools,
		denoms: denomDocument.entries,
		channels: channelDocument.entries,
		grpc,
		retryOptions: { ...config, onRetry: retryReporter('IBC metadata') },
	});
	const index = buildPoolIndex(pools, ibc.denoms);

	await writeJsonAtomically(paths.denoms, {
		version: 1,
		generatedAt: new Date().toISOString(),
		entries: ibc.denoms,
	});
	await writeJsonAtomically(paths.channels, {
		version: 1,
		generatedAt: new Date().toISOString(),
		entries: ibc.channels,
	});
	await writeJsonAtomically(paths.poolIndex, {
		version: 1,
		generatedAt: new Date().toISOString(),
		...index,
	});
	await writeJsonAtomically(paths.pools, { pools });
	await writeJsonAtomically(paths.state, {
		mode,
		complete: true,
		updatedAt: new Date().toISOString(),
		completedPools: pools.length,
	});

	console.log(`Saved ${pools.length} pools, ${Object.keys(ibc.denoms).length} IBC traces, and the local pool index.`);
}

async function main() {
	const mode = await resolveCollectionMode(process.argv.slice(2), promptForMode);
	const grpc = new GrpcClient(grpcEndpoints, { timeoutMs: config.requestTimeoutMs });
	try {
		await collectPools(mode, grpc);
	} finally {
		grpc.close();
	}
}

if (import.meta.main) {
	main().catch(error => {
		console.error('Collection failed:', error.message);
		process.exit(1);
	});
}
