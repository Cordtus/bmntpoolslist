import { expect, test } from 'bun:test';
import { decodeIbcDenomFromCache } from '../denom.js';

test('decodes an IBC denom from generated data without making a network request', () => {
	const decoded = decodeIbcDenomFromCache(
		'ibc/27394FB092D2ECCD56123C74F36E4C1F926001CEADA9CA97EA622B25F41E5EB2',
		{
			entries: {
				'27394FB092D2ECCD56123C74F36E4C1F926001CEADA9CA97EA622B25F41E5EB2': {
					baseDenom: 'uatom',
					path: 'transfer/channel-0',
					channelIds: ['channel-0'],
					sourceChainId: 'cosmoshub-4',
				},
			},
		},
	);

	expect(decoded).toEqual({
		denom: 'ibc/27394FB092D2ECCD56123C74F36E4C1F926001CEADA9CA97EA622B25F41E5EB2',
		isIbc: true,
		baseDenom: 'uatom',
		path: 'transfer/channel-0',
		channelIds: ['channel-0'],
		sourceChainId: 'cosmoshub-4',
	});
});
