#!/usr/bin/env bun
import { createInterface } from 'node:readline/promises';
import {
	findByAsset,
	findByAssets,
	findByAnyAsset,
	getPool,
	decodePoolAssets,
	formatPool,
	formatPoolWithUsd,
	findByBaseDenom,
	findByChannel,
	searchByBaseDenom,
} from './query.js';
import { decodeIbcDenom, formatDenom } from './denom.js';
import { buildPromptedQuery } from './search-flow.js';

const args = process.argv.slice(2);
const initialCommand = args[0];

function printUsage() {
	console.log(`
Osmosis Pool Query CLI

Usage:
  bun run search-pools [command] [value]

Commands:
  token <baseDenom>         List pools containing a raw or IBC-decoded base denom
  channel <channel-id>      List pools whose IBC trace includes a channel
  asset <denom>             Find pools containing an asset denom
  assets <all|any> <...>    Find pools containing every or any listed asset
  search <baseDenom>        Alias for token
  pool <id>                 Get pool by ID
  decode <ibc/hash>         Decode IBC denom

Examples:
  bun run search-pools
  bun run search-pools token uatom
  bun run search-pools channel channel-0
  bun run search-pools pool 1
`);
}

function isCompleteQuery(query) {
	if (!query?.command || query.args.length === 0) return false;
	if (query.command === 'assets') {
		return ['all', 'any'].includes(query.args[0]) && query.args.length >= 3;
	}
	return true;
}

async function promptForQuery() {
	if (!process.stdin.isTTY) return null;
	const readline = createInterface({ input: process.stdin, output: process.stdout });
	try {
		while (true) {
			const query = await buildPromptedQuery(question => readline.question(`${question}\n> `));
			if (isCompleteQuery(query)) return query;
			console.log('Please choose an option and provide the requested value.');
		}
	} finally {
		readline.close();
	}
}

async function run() {
	if (['help', '--help', '-h'].includes(initialCommand)) {
		printUsage();
		return;
	}

	const promptedQuery = !initialCommand || ['ask', 'wizard'].includes(initialCommand)
		? await promptForQuery()
		: null;
	if (!initialCommand && !promptedQuery) {
		printUsage();
		return;
	}

	const cmd = promptedQuery?.command || initialCommand;
	const commandArgs = promptedQuery?.args || args.slice(1);

	switch (cmd) {
		case 'find':
		case 'asset': {
			const term = commandArgs[0];
			if (!term) {
				console.error('Error: asset required');
				return;
			}
			const pools = await findByAsset(term);
			console.log(`Found ${pools.length} pools containing "${term}":\n`);
			for (const pool of pools.slice(0, 20)) {
				console.log(formatPool(pool));
				console.log();
			}
			if (pools.length > 20) {
				console.log(`... and ${pools.length - 20} more`);
			}
			break;
		}

		case 'find-exact': {
			const term = commandArgs[0];
			if (!term) {
				console.error('Error: asset required');
				return;
			}
			const pools = await findByAsset(term, true);
			console.log(`Found ${pools.length} pools with exact match "${term}":\n`);
			for (const pool of pools.slice(0, 20)) {
				console.log(formatPool(pool));
				console.log();
			}
			if (pools.length > 20) {
				console.log(`... and ${pools.length - 20} more`);
			}
			break;
		}

		case 'find-all': {
			const terms = commandArgs;
			if (terms.length < 2) {
				console.error('Error: at least 2 assets required');
				return;
			}
			const pools = await findByAssets(terms);
			console.log(`Found ${pools.length} pools containing ALL of [${terms.join(', ')}]:\n`);
			for (const pool of pools.slice(0, 20)) {
				console.log(formatPool(pool));
				console.log();
			}
			if (pools.length > 20) {
				console.log(`... and ${pools.length - 20} more`);
			}
			break;
		}

		case 'find-any': {
			const terms = commandArgs;
			if (terms.length < 2) {
				console.error('Error: at least 2 assets required');
				return;
			}
			const pools = await findByAnyAsset(terms);
			console.log(`Found ${pools.length} pools containing ANY of [${terms.join(', ')}]:\n`);
			for (const pool of pools.slice(0, 20)) {
				console.log(formatPool(pool));
				console.log();
			}
			if (pools.length > 20) {
				console.log(`... and ${pools.length - 20} more`);
			}
			break;
		}

		case 'assets': {
			const mode = commandArgs[0];
			const terms = commandArgs.slice(1);
			if (!['all', 'any'].includes(mode) || terms.length < 2) {
				console.error('Error: use "assets all <a1> <a2>" or "assets any <a1> <a2>"');
				return;
			}
			const pools = mode === 'all'
				? await findByAssets(terms)
				: await findByAnyAsset(terms);
			console.log(`Found ${pools.length} pools containing ${mode.toUpperCase()} of [${terms.join(', ')}]:\n`);
			for (const pool of pools.slice(0, 20)) {
				console.log(formatPool(pool));
				console.log();
			}
			if (pools.length > 20) {
				console.log(`... and ${pools.length - 20} more`);
			}
			break;
		}

		case 'token':
		case 'search': {
			const term = commandArgs[0];
			if (!term) {
				console.error('Error: base denom required');
				return;
			}
			const pools = cmd === 'search'
				? await searchByBaseDenom(term)
				: await findByBaseDenom(term);
			console.log(`Found ${pools.length} pools containing base denom "${term}":\n`);
			for (const pool of pools.slice(0, 10)) {
				const decoded = await decodePoolAssets(pool);
				console.log(formatPool(decoded, true));
				console.log();
			}
			if (pools.length > 10) {
				console.log(`... and ${pools.length - 10} more`);
			}
			break;
		}

		case 'channel': {
			const channelId = commandArgs[0];
			if (!channelId) {
				console.error('Error: channel ID required');
				return;
			}
			const pools = await findByChannel(channelId);
			console.log(`Found ${pools.length} pools using ${channelId}:\n`);
			for (const pool of pools.slice(0, 10)) {
				const decoded = await decodePoolAssets(pool);
				console.log(formatPool(decoded, true));
				console.log();
			}
			if (pools.length > 10) {
				console.log(`... and ${pools.length - 10} more`);
			}
			break;
		}

		case 'pool': {
			const id = commandArgs[0];
			if (!id) {
				console.error('Error: pool ID required');
				return;
			}
			const pool = await getPool(id);
			if (!pool) {
				console.error(`Pool ${id} not found`);
				return;
			}
			const decoded = await decodePoolAssets(pool);
			console.log(await formatPoolWithUsd(decoded, true));
			break;
		}

		case 'decode': {
			const denom = commandArgs[0];
			if (!denom) {
				console.error('Error: IBC denom required');
				return;
			}
			const decoded = await decodeIbcDenom(denom);
			if (decoded.isIbc) {
				console.log(`Denom: ${denom}`);
				console.log(`Base:  ${decoded.baseDenom || 'unknown'}`);
				console.log(`Path:  ${decoded.path || 'unknown'}`);
				console.log(`Display: ${formatDenom(decoded)}`);
			} else {
				console.log(`${denom} is not an IBC denom`);
			}
			break;
		}

		default:
			console.error(`Unknown command: ${cmd}`);
			printUsage();
	}
}

run().catch(err => {
	console.error('Error:', err.message);
	process.exit(1);
});
