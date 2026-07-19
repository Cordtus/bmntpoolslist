import { expect, test } from 'bun:test';
import { findPoolsByBaseDenom, findPoolsByChannel } from '../query.js';

const pools = [
	{ id: '1', assets: { token1: 'uosmo', token2: 'ibc/ABC' } },
	{ id: '2', assets: { token1: 'uatom', token2: 'uosmo' } },
	{ id: '3', assets: { token1: 'ibc/ABC', token2: 'ujuno' } },
];

const index = {
	baseDenom: { uatom: ['1', '2', '3'] },
	channel: { 'channel-0': ['1', '3'] },
};

test('finds every pool for a base denom through the offline index', () => {
	expect(findPoolsByBaseDenom(pools, index, 'uatom').map((pool) => pool.id)).toEqual(['1', '2', '3']);
});

test('finds every pool traversing an IBC channel through the offline index', () => {
	expect(findPoolsByChannel(pools, index, 'channel-0').map((pool) => pool.id)).toEqual(['1', '3']);
});
