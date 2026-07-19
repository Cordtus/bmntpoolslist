# Osmosis Pool Collector

Build a local snapshot of Osmosis pools, then search it from your terminal.

## Setup

Install [Bun](https://bun.sh), then install dependencies:

```bash
bun install
```

## Build pool data

For your first run, create a complete snapshot:

```bash
bun run generate-pools:fresh
```

To choose between a full or partial update when you run the command, use:

```bash
bun run generate-pools
```

Use a partial update to reuse saved pool liquidity and fetch only missing or incomplete data:

```bash
bun run generate-pools:partial
```

The generated snapshot is stored in `data/`.

## Search pools

Run the guided search to choose what you want to find:

```bash
bun run search-pools
```

Or use a direct command:

```bash
# Every pool containing ATOM, including decoded IBC ATOM
bun run search-pools token uatom

# Pools whose IBC trace includes a channel
bun run search-pools channel channel-0

# Pools containing an exact or partial asset denom
bun run search-pools asset uosmo

# Pools containing all or any listed assets
bun run search-pools assets all uosmo uatom
bun run search-pools assets any uosmo uatom

# Inspect a pool or decode an IBC denom
bun run search-pools pool 1
bun run search-pools decode ibc/HASH
```

Run `bun run search-pools --help` to see the available commands.

## Development

```bash
bun test
RUN_LIVE_GRPC=1 bun test test/grpc.integration.test.js
```
