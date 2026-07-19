import { expect, test } from 'bun:test';
import { normalizePool, refreshPoolMetadata, selectPoolUpdates } from '../collector.js';

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
		liquidityComplete: true,
		fees: { swapFee: '0.002', exitFee: '' },
	});
});

test('converts atomic GAMM fee decimals to their display value', () => {
	const pool = normalizePool({
		'@type': '/osmosis.gamm.v1beta1.Pool',
		id: '1',
		poolParams: { swapFee: '3000000000000000', exitFee: '0' },
		poolAssets: [],
	}, { liquidity: [] });

	expect(pool.fees).toEqual({ swapFee: '0.003', exitFee: '0' });
});

test('partial mode only queues pools absent or incomplete in saved data', () => {
	const current = [
		{ id: '1', liquidity: { token1: { denom: 'uosmo', amount: '1' } } },
		{ id: '2', liquidity: {} },
		{ id: '4', liquidity: {}, liquidityComplete: true },
	];
	const allPools = [{ id: '1' }, { id: '2' }, { id: '3' }, { id: '4' }];

	expect(selectPoolUpdates(allPools, current, 'partial').map(pool => pool.id)).toEqual(['2', '3']);
	expect(selectPoolUpdates(allPools, current, 'fresh').map(pool => pool.id)).toEqual(['1', '2', '3', '4']);
});

test('extracts valid IBC denoms from malformed CosmWasm liquidity payloads', () => {
	const first = '8242AD24008032E457D2E12D46588FD39FB54FB29680C6C7663D296B383C37C4';
	const second = '4ABBEF4C8926DDDB320AE5188CFD63267ABBCEFC0583E4AE05D6E5AA2401DDAB';
	const pool = normalizePool({
		'@type': '/osmosis.cosmwasmpool.v1beta1.CosmWasmPool',
		id: '1175',
		contractAddress: 'osmo1contract',
	}, {
		liquidity: [
			{ denom: `{pool_asset_denoms:[ibc/${first}`, amount: '0' },
			{ denom: `ibc/${second}]`, amount: '0' },
		],
	});

	expect(pool.assets).toEqual({
		token1: `ibc/${first}`,
		token2: `ibc/${second}`,
	});
});

test('refreshes pool metadata without discarding saved liquidity', () => {
	const pools = refreshPoolMetadata([{
		'@type': '/osmosis.gamm.v1beta1.Pool',
		id: '1',
		address: 'osmo1updated',
		poolParams: { swapFee: '3000000000000000', exitFee: '0' },
		poolAssets: [{ token: { denom: 'uosmo' } }],
	}], [{
		id: '1',
		address: 'osmo1old',
		assets: { token1: 'uosmo' },
		liquidity: { token1: { denom: 'uosmo', amount: '123' } },
		fees: { swapFee: '3000000000000000', exitFee: '0' },
	}]);

	expect(pools).toEqual([{
		id: '1',
		type: 'gamm',
		address: 'osmo1updated',
		assets: { token1: 'uosmo' },
		liquidity: { token1: { denom: 'uosmo', amount: '123' } },
		fees: { swapFee: '0.003', exitFee: '0' },
	}]);
});
