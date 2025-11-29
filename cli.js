#!/usr/bin/env bun
import {
	findByAsset,
	findByAssets,
	findByAnyAsset,
	getPool,
	decodePoolAssets,
	formatPool,
	formatPoolWithUsd,
	getPoolTvl,
	searchByBaseDenom,
} from './query.js';
import { formatUsd } from './price.js';
import { decodeIbcDenom, formatDenom } from './denom.js';

const args = process.argv.slice(2);
const cmd = args[0];

function printUsage() {
	console.log(`
Osmosis Pool Query CLI

Usage:
  bun cli.js <command> [options]

Commands:
  find <asset>              Find pools containing asset (partial match)
  find-exact <asset>        Find pools with exact asset match
  find-all <a1> <a2> ...    Find pools containing ALL assets
  find-any <a1> <a2> ...    Find pools containing ANY asset
  search <baseDenom>        Search by base denom (decodes IBC)
  pool <id>                 Get pool by ID
  decode <ibc/hash>         Decode IBC denom

Examples:
  bun cli.js find uosmo
  bun cli.js find-all uosmo uatom
  bun cli.js search atom
  bun cli.js pool 1
  bun cli.js decode ibc/27394FB092D2ECCD56123C74F36E4C1F926001CEADA9CA97EA622B25F41E5EB2
`);
}

async function run() {
	if (!cmd || cmd === 'help' || cmd === '--help' || cmd === '-h') {
		printUsage();
		return;
	}

	switch (cmd) {
		case 'find': {
			const term = args[1];
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
			const term = args[1];
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
			const terms = args.slice(1);
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
			const terms = args.slice(1);
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

		case 'search': {
			const term = args[1];
			if (!term) {
				console.error('Error: base denom required');
				return;
			}
			console.log(`Searching for "${term}" (decoding IBC denoms)...\n`);
			const pools = await searchByBaseDenom(term);
			console.log(`Found ${pools.length} pools:\n`);
			for (const pool of pools.slice(0, 10)) {
				const decoded = await decodePoolAssets(pool);
				console.log(await formatPoolWithUsd(decoded, true));
				console.log();
			}
			if (pools.length > 10) {
				console.log(`... and ${pools.length - 10} more`);
			}
			break;
		}

		case 'pool': {
			const id = args[1];
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
			const denom = args[1];
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
