# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Osmosis blockchain pool data collector. Fetches liquidity pool information from REST APIs, normalizes it across pool types, and stores in JSON. Designed for long-running collection with resume capability.

## Running the Application

```bash
bun run start    # standard run
bun run dev      # watch mode with auto-reload
```

No dependencies to install. Uses Bun native APIs exclusively.

## Architecture

Three-file ESM structure:

- **app.js** - Main loop: pool iteration, type detection, normalization, failure handling
- **config.js** - REST endpoints, retry settings, pool type constants
- **utils.js** - Bun-native file I/O (`Bun.file`, `Bun.write`) and fetch utilities

Data flows: `fetchWithRetry` -> `formatPool` -> `writePools`

## Pool Type Handling

Four pool types normalized into consistent format:
- `concentratedliquidity` - uses `spread_factor` for fees, `token0`/`token1` for assets
- `gamm` - uses `pool_params` for fees, `pool_assets` for assets
- `stableswap` - uses `pool_params` for fees, `pool_liquidity` for assets
- `cosmwasm` - contract-based pools with `contract_address`

## Key Patterns

**Endpoint Redundancy**: Cycles through `restEndpoints` array on failure

**Retry Logic**: Configurable via `config.maxRetries`, rotates endpoints between attempts

**Backoff**: After `shortWaitThreshold` failures, waits 5 min; after 3x short waits, 6 hour wait

**Resume**: Reads last pool ID from pools.json, continues from next ID

## Configuration

All settings in `config.js`:
- `restEndpoints` - API base URLs
- `poolApiPath()` - URL path template
- `config` object - retry counts, delay timings
- `poolTypes` - type string constants

## Data Output

`data/pools.json` - normalized pool objects with consistent structure:
```json
{
  "type": "gamm",
  "id": "1",
  "address": "osmo1...",
  "assets": { "token1": "uosmo", "token2": "ibc/..." },
  "fees": { "swapFee": "0.002", "exitFee": "0" }
}
```
