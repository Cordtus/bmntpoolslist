import { expect, test } from 'bun:test';
import { buildPoolIndex, findPoolIdsByBaseDenom, findPoolIdsByChannel } from '../pool-index.js';

const pools = [
	{
		id: '1',
		assets: { token1: 'uosmo', token2: 'ibc/ATOM_HASH' },
	},
	{
		id: '2',
		assets: { token1: 'uatom', token2: 'uosmo' },
	},
];

const denoms = {
	ATOM_HASH: {
		baseDenom: 'uatom',
		channelIds: ['channel-0'],
		sourceChainId: 'cosmoshub-4',
	},
};

test('indexes direct and IBC-backed pools by base denom', () => {
	const index = buildPoolIndex(pools, denoms);

	expect(findPoolIdsByBaseDenom(index, 'uatom')).toEqual(['1', '2']);
	expect(findPoolIdsByBaseDenom(index, 'UATOM')).toEqual(['1', '2']);
});

test('indexes IBC-backed pools by the trace channel', () => {
	const index = buildPoolIndex(pools, denoms);

	expect(findPoolIdsByChannel(index, 'channel-0')).toEqual(['1']);
});
