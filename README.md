# Osmosis Pool Collector

A Bun CLI that builds a local snapshot of every Osmosis pool, its live on-chain liquidity, and immutable IBC-denom metadata. All chain requests use native gRPC; the default endpoint is Polkachú's plaintext (h2c) endpoint, with TLS gRPC failovers.

## Install

```bash
bun install
```

## Build a snapshot

Run without arguments to choose interactively:

```bash
bun run start
```

Or select a mode explicitly:

```bash
# Rebuild every pool into a new snapshot
bun run start -- --mode fresh

# Reuse complete pools and fetch only missing or incomplete liquidity
bun run start -- --mode partial
```

Required queries retry forever after `RESOURCE_EXHAUSTED`/429-style responses or other gRPC failures. Retries back off exponentially, reduce shared concurrency, and recover gradually after successful calls. Interrupted fresh runs resume from `data/pools.pending.json`; `data/pools.json` is only published after collection completes.

## Search generated data

These commands read the snapshot and indexes locally—no chain request is made:

```bash
# Includes both native uatom and IBC denoms whose trace base is uatom
bun run cli.js token uatom

# Find pools with an IBC trace that traverses this Osmosis channel
bun run cli.js channel channel-0

# Compatibility alias for token
bun run cli.js search uatom

# Other local searches
bun run cli.js find uosmo
bun run cli.js find-all uosmo uatom
bun run cli.js pool 1
```

`pool` may request optional off-chain price data for USD display. Price and Chain Registry calls are never used for chain collection.

## Generated data

- `data/pools.json` — normalized pool definitions and liquidity.
- `data/denoms.json` — cached IBC hash, full trace path, base denom, channel IDs, and direct counterparty `sourceChainId`.
- `data/channels.json` — channel → connection/client/source-chain metadata, resolved once through IBC gRPC.
- `data/pool-index.json` — base-denom and channel lookup indexes.
- `data/collection-state.json` and `data/pools.pending.json` — durable fresh-snapshot checkpoints.

`sourceChainId` is the direct IBC counterparty of the first channel in the preserved trace path. A trace may contain additional hops; the complete path remains in `denoms.json`.

## Development

```bash
bun test
RUN_LIVE_GRPC=1 bun test test/grpc.integration.test.js
```

The live test confirms Polkachú plaintext gRPC can load `AllPools`. Configure failovers and collection limits in `config.js`; keep the Polkachú URL `http://` because it does not use TLS.
