# Osmosis Pool Collector

A Bun-native tool for collecting, querying, and analyzing Osmosis DEX liquidity pools with real-time USD pricing.

## Features

- Collects all pool types: GAMM, Concentrated Liquidity, StableSwap, CosmWasm
- IBC denom decoding with caching
- Real-time USD pricing via CoinGecko (using Cosmos Chain Registry for token mapping)
- Multi-endpoint rotation for reliability
- Incremental collection with resume support

## Requirements

- [Bun](https://bun.sh) >= 1.0.0

## Installation

```bash
git clone https://github.com/Cordtus/bmntpoolslist.git
cd bmntpoolslist
```

No dependencies to install - uses Bun native APIs.

## Usage

### Collect Pool Data

```bash
bun run start
# or
bun run app.js
```

This fetches all Osmosis pools and saves them to `data/pools.json`. Collection resumes from the last saved pool ID if interrupted.

### Query Pools

```bash
# Search by base denom (decodes IBC denoms, shows USD values)
bun run cli.js search atom
bun run cli.js search rowan

# Find pools containing an asset (partial match)
bun run cli.js find uosmo

# Find pools with exact asset match
bun run cli.js find-exact uosmo

# Find pools containing ALL specified assets
bun run cli.js find-all uosmo uatom

# Find pools containing ANY of the specified assets
bun run cli.js find-any uosmo uatom ujuno

# Get specific pool by ID (with USD values)
bun run cli.js pool 1

# Decode an IBC denom
bun run cli.js decode ibc/27394FB092D2ECCD56123C74F36E4C1F926001CEADA9CA97EA622B25F41E5EB2
```

### Example Output

```
Pool #1 (gamm)
  Address: osmo1mw0ac6rwlp5r8wapwk3zs6g29h8fcscxqakdzw9emkne6c8wjp9q0t3v8t
  Assets:
    token1: uatom (channel-0) [279.41K] ($681.76K)
    token2: uosmo [8.72M] ($681.97K)
  Total TVL: $1.36M
  Swap Fee: 0.20%
```

## Project Structure

```
.
├── app.js          # Main collector - fetches pools from REST APIs
├── cli.js          # Command-line interface for querying
├── config.js       # REST endpoints and configuration
├── denom.js        # IBC denom decoding with cache
├── price.js        # USD pricing via CoinGecko + Chain Registry
├── query.js        # Pool search and formatting functions
├── utils.js        # File I/O and fetch utilities
└── data/
    ├── pools.json      # Collected pool data
    ├── denom_cache.json # IBC denom decode cache
    ├── assetlist.json   # Chain registry asset cache
    └── prices.json      # Price cache
```

## Configuration

Edit `config.js` to customize:

- `restEndpoints` - REST API endpoints (rotates on failure)
- `config.maxRetries` - Retry attempts per pool
- `config.requestDelayMs` - Delay between requests

Default endpoints:
- lcd.osmosis.zone
- rest.lavenderfive.com/osmosis
- rest-osmosis.ecostake.com
- osmosis-api.polkachu.com
- rest.osmosis.goldenratiostaking.net

## Pool Types

| Type | Description |
|------|-------------|
| `gamm` | Classic XYK AMM pools |
| `stableswap` | Curve-style stable pools |
| `concentratedliquidity` | Uniswap v3 style CL pools |
| `cosmwasmpool` | CosmWasm-based pools (Transmuter, etc.) |

## Data Format

Each pool in `pools.json`:

```json
{
  "type": "gamm",
  "id": "1",
  "address": "osmo1...",
  "assets": {
    "token1": "ibc/27394...",
    "token2": "uosmo"
  },
  "liquidity": {
    "token1": { "denom": "ibc/27394...", "amount": "279410000000" },
    "token2": { "denom": "uosmo", "amount": "8720000000000" }
  },
  "fees": {
    "swapFee": "0.002",
    "exitFee": "0"
  }
}
```

## Caching

- **IBC denoms**: Cached indefinitely in `data/denom_cache.json`
- **Asset list**: Cached 24 hours in `data/assetlist.json`
- **Prices**: Cached 5 minutes in `data/prices.json`

## License

MIT
