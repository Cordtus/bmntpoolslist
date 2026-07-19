import { expect, test } from 'bun:test';
import { normalizePool, selectPoolUpdates } from '../collector.js';

test('normalizes concentrated-pool assets and live liquidity from gRPC fields', () => {
	const pool = normalizePool({
		'@type': '/osmosis.concentratedliquidity.v1beta1.Pool',
		id: '1066',
		address: 'osmo1pool',
		token0: 'uosmo',
		token1: 'uatom',
		spreadFactor: '2000000000000000',
	}, {
		liquidity: [
			{ denom: 'uosmo', amount: '123' },
			{ denom: 'uatom', amount: '456' },
		],
	});

	expect(pool).toEqual({
		type: 'concentratedliquidity',
		id: '1066',
		address: 'osmo1pool',
		assets: { token1: 'uosmo', token2: 'uatom' },
		liquidity: {
			token1: { denom: 'uosmo', amount: '123' },
			token2: { denom: 'uatom', amount: '456' },
		},
		fees: { swapFee: '2000000000000000', exitFee: '' },
	});
});

test('partial mode only queues pools absent or incomplete in saved data', () => {
	const current = [
		{ id: '1', liquidity: { token1: { denom: 'uosmo', amount: '1' } } },
		{ id: '2', liquidity: {} },
	];
	const allPools = [{ id: '1' }, { id: '2' }, { id: '3' }];

	expect(selectPoolUpdates(allPools, current, 'partial').map(pool => pool.id)).toEqual(['2', '3']);
	expect(selectPoolUpdates(allPools, current, 'fresh').map(pool => pool.id)).toEqual(['1', '2', '3']);
});
