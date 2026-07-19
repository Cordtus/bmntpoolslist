export const guidedMenu = `
What would you like to find?
  1. Pools containing a token
  2. Pools using an IBC channel
  3. Pools containing a raw asset denom
  4. Pools containing several assets
  5. One pool by ID
  6. Decode an IBC denom

You can also type a request such as "find pools with uatom".`;

function terms(value) {
	return String(value || '')
		.split(/[\s,]+/)
		.map(term => term.trim())
		.filter(Boolean);
}

export function parseNaturalLanguageQuery(value) {
	const input = String(value || '').trim();
	if (!input) return null;

	const pool = /\bpool\s+#?(\d+)\b/i.exec(input);
	if (pool) return { command: 'pool', args: [pool[1]] };

	const channel = /\b(channel-\d+)\b/i.exec(input);
	if (channel) return { command: 'channel', args: [channel[1]] };

	const ibc = /\b(ibc\/[0-9a-f]{64})\b/i.exec(input);
	if (/\bdecode\b/i.test(input) && ibc) return { command: 'decode', args: [ibc[1]] };

	const token = /(?:\btoken\b|\bdenom\b|\bwith\b|\bcontaining\b)\s+([a-z][a-z0-9/._-]*)\b/i.exec(input);
	if (token) return { command: 'token', args: [token[1]] };

	return null;
}

export async function buildPromptedQuery(ask) {
	const choice = String(await ask(guidedMenu)).trim();
	const naturalLanguageQuery = parseNaturalLanguageQuery(choice);
	if (naturalLanguageQuery) return naturalLanguageQuery;

	switch (choice) {
		case '1':
			return { command: 'token', args: terms(await ask('Which base denom should be included?')) };
		case '2':
			return { command: 'channel', args: terms(await ask('Which channel ID should be included?')) };
		case '3':
			return { command: 'asset', args: terms(await ask('Which asset denom should be included?')) };
		case '4': {
			const match = String(await ask('Should pools contain all or any of the assets?')).trim().toLowerCase();
			if (!['all', 'any'].includes(match)) return null;
			return { command: 'assets', args: [match, ...terms(await ask('List the asset denoms, separated by spaces or commas.'))] };
		}
		case '5':
			return { command: 'pool', args: terms(await ask('Which pool ID would you like to inspect?')) };
		case '6':
			return { command: 'decode', args: terms(await ask('Which IBC denom would you like to decode?')) };
		default:
			return null;
	}
}
