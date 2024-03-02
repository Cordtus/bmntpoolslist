const fs = require('fs');
const path = require('path');

const dataPath = path.join(__dirname, 'data', 'pools.json');

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

// Run HTTP request
async function fetchPoolData(restAddress, poolId) {
    const fetch = (await import('node-fetch')).default;

    const url = `${restAddress}/osmosis/poolmanager/v1beta1/pools/${poolId}`;
    try {
        const response = await fetch(url);
        if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
        const data = await response.json();
        return data;
    } catch (error) {
        console.error("Fetch error:", error);
        throw error;
    }
}

module.exports = { readPoolsFile, writePoolsFile, fetchPoolData };
