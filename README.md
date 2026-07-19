# Osmosis Pool Collector

Build a local, searchable snapshot of Osmosis liquidity pools. The collector reads chain data over gRPC and stores pools, IBC denom metadata, and lookup indexes on disk.

## Quick start

Install [Bun](https://bun.sh), then install the project dependencies:

```bash
bun install
```

Create a complete new snapshot:

```bash
bun run start -- --mode fresh
```

When it finishes, search every pool containing ATOM—including IBC ATOM denoms:

```bash
bun run cli.js token uatom
```

## Collecting data

Run the collector without a flag to choose a mode interactively:

```bash
bun run start
```

Use `fresh` when you want a new full snapshot. It fetches all pools and writes the finished result to `data/pools.json`. If interrupted, run the same command again to resume from its checkpoint.

```bash
bun run start -- --mode fresh
```

Use `partial` for a fast follow-up. It keeps saved liquidity, refreshes pool metadata, and fetches liquidity only for pools that are missing or incomplete.

```bash
bun run start -- --mode partial
```

Required chain requests automatically back off and retry after rate limits or temporary gRPC failures. The primary endpoint is Polkachú’s plaintext gRPC service, with public TLS gRPC failovers.

## Search your snapshot

All commands below read local generated data; they do not make a chain request.

```bash
# Pools containing a native denom or an IBC denom mapped to it
bun run cli.js token uatom

# Pools whose IBC trace uses a specific Osmosis channel
bun run cli.js channel channel-0

# Find a raw asset denom (partial or exact match)
bun run cli.js find uosmo
bun run cli.js find-exact uosmo

# Find pools containing every listed asset
bun run cli.js find-all uosmo uatom

# `search` is an alias for `token`
bun run cli.js search uatom

# Inspect one pool; may fetch optional off-chain USD prices
bun run cli.js pool 1
```

Run `bun run cli.js --help` for the complete command list.

## Generated files

- `data/pools.json` — pool assets, liquidity, and fees.
- `data/denoms.json` — IBC hash, base denom, trace path, channels, and direct source chain ID.
- `data/channels.json` — cached channel-to-source-chain metadata.
- `data/pool-index.json` — fast token and channel lookup indexes.

The direct `sourceChainId` is the counterparty of the first channel in an IBC trace. The complete trace path remains available in `data/denoms.json`.

## Development

```bash
bun test
RUN_LIVE_GRPC=1 bun test test/grpc.integration.test.js
```
