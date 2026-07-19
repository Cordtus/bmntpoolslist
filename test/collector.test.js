import { expect, test } from 'bun:test';
import { collectWithAdaptiveConcurrency } from '../collector.js';

test('keeps a failed liquidity query queued until every pool has a result', async () => {
	const calls = new Map();
	let now = 0;
	const pools = [{ id: '1' }, { id: '2' }];

	const results = await collectWithAdaptiveConcurrency(pools, async pool => {
		const count = (calls.get(pool.id) || 0) + 1;
		calls.set(pool.id, count);
		if (pool.id === '1' && count === 1) {
			const error = new Error('resource exhausted');
			error.code = 8;
			throw error;
		}
		return { id: pool.id, liquidity: [{ denom: 'uosmo', amount: pool.id }] };
	}, {
		initialConcurrency: 2,
		minConcurrency: 1,
		maxConcurrency: 2,
		initialDelayMs: 100,
		now: () => now,
		random: () => 0,
		sleep: async ms => { now += ms; },
	});

	expect(results).toEqual([
		{ id: '1', liquidity: [{ denom: 'uosmo', amount: '1' }] },
		{ id: '2', liquidity: [{ denom: 'uosmo', amount: '2' }] },
	]);
	expect(calls.get('1')).toBe(2);
	expect(calls.get('2')).toBe(1);
});

test('reports each completed pool so collection progress can be checkpointed', async () => {
	const completed = [];

	await collectWithAdaptiveConcurrency([{ id: '1' }, { id: '2' }], async pool => ({ id: pool.id }), {
		initialConcurrency: 1,
		maxConcurrency: 1,
		sleep: async () => {},
		onResult: async result => completed.push(result.id),
	});

	expect(completed).toEqual(['1', '2']);
});
