const fs = require('fs');
const path = require('path');
const { Buffer } = require('buffer');

const dataPath = path.join(__dirname, 'data', 'pools.json');

function encodeQuery(query) {
    return Buffer.from(JSON.stringify(query)).toString('base64');
}
async function queryCosmWasmPool(restAddress, contractAddress, query) {
    const encodedQuery = encodeQuery(query);
    const url = `${restAddress}/cosmwasm/wasm/v1/contract/${contractAddress}/smart/${encodedQuery}`;
    try {
        const fetch = (await import('node-fetch')).default;
        const response = await fetch(url);
        if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
        return await response.json();
    } catch (error) {
        console.error("Error querying CosmWasm pool:", error);
        throw error;
    }
}

async function fetchRestAddresses() {
    const fetch = (await import('node-fetch')).default;
    const url = 'https://raw.githubusercontent.com/cosmos/chain-registry/master/osmosis/chain.json';
    
    try {
        const response = await fetch(url);
        if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
        const json = await response.json();
        return json.apis.rest.map(api => api.address).filter(Boolean);
    } catch (error) {
        console.error("Failed to fetch REST addresses:", error);
        return [];  // Return an empty array or some default addresses as fallback
    }
}

// Ensure the 'data' directory exists
function ensureDataDirectory() {
    const dir = path.dirname(dataPath);
    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
        console.log(`Created directory at ${dir}`);
    }
}

// Check and read pools file, create if not exists
function readPoolsFile() {
    ensureDataDirectory(); // Ensure the data directory exists
    if (fs.existsSync(dataPath)) {
        const data = fs.readFileSync(dataPath);
        try {
            return JSON.parse(data.toString());
        } catch (error) {
            console.error("Error parsing JSON from file:", error);
            // Initialize with an empty structure if parsing fails
            return { pools: [] };
        }
    } else {
        // Initialize the file with an empty structure if it doesn't exist
        console.log('pools.json not found, creating a new file.');
        const initData = { pools: [] };
        writePoolsFile(initData); // Reuse the write function to ensure consistency
        return initData;
    }
}

// Write new pool data, with logging
function writePoolsFile(data) {
    try {
        fs.writeFileSync(dataPath, JSON.stringify(data, null, 2));
        console.log('Data successfully written to pools.json');
    } catch (error) {
        console.error("Error writing to file:", error);
    }
}

async function fetchPoolData(restAddress, poolId) {
    const fetch = (await import('node-fetch')).default;
    const url = `${restAddress}/osmosis/poolmanager/v1beta1/pools/${poolId}`;
    try {
        const response = await fetch(url);
        if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
        const json = await response.text();
        try {
            return JSON.parse(json);
        } catch (e) {
            throw new Error('Failed to parse JSON response.');
        }
    } catch (error) {
        console.error("Fetch error:", error);
        throw error;
    }
}

// Fetch base denom information
async function fetchBaseDenom(restAddress, ibcId) {
    const fetch = (await import('node-fetch')).default;
    const url = `${restAddress}/ibc/apps/transfer/v1/denom_traces/${ibcId}`;
    try {
        const response = await fetch(url);
        if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
        const { denom_trace } = await response.json();
        return denom_trace.base_denom;
    } catch (error) {
        console.error("Fetch error:", error);
        throw error;
    }
}

module.exports = { queryCosmWasmPool, fetchRestAddresses, readPoolsFile, writePoolsFile, fetchPoolData, fetchBaseDenom };
