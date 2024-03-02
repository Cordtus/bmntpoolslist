const { restAddresses } = require('./config');
const { readPoolsFile, writePoolsFile, fetchPoolData } = require('./utils');

async function fetchAndProcessPoolData(startingPoolId) {
  let poolId = startingPoolId;
  let restAddressIndex = 0;
  let consecutiveFailures = 0;
  let fiveMinWaitCount = 0;
  const maxRetries = 5; // Maximum number of retries before skipping to the next pool ID or rest address

  const existingData = readPoolsFile() || { pools: [] };
  if (existingData.pools.length > 0) {
    const lastPool = existingData.pools[existingData.pools.length - 1];
    poolId = parseInt(lastPool.id) + 1;
    console.log(`Resuming from pool ID ${poolId}`);
  } else {
    console.log('Starting with pool ID 1');
  }

  while (consecutiveFailures <= maxRetries) {
    try {
      console.log(`Fetching data for pool ID ${poolId} from address index ${restAddressIndex}`);
      const responseData = await fetchPoolData(restAddresses[restAddressIndex], poolId);
      if (responseData && responseData.pool) {
        const formattedData = formatData(responseData);
        existingData.pools.push(formattedData);
        writePoolsFile(existingData);
        console.log(`Successfully processed and saved pool ID ${poolId}`);
        poolId++;
        consecutiveFailures = 0; // Reset on success
        restAddressIndex = 0; // Reset to first REST address on success
      } else {
        throw new Error('Invalid JSON response');
      }
    } catch (error) {
      console.error(`Error fetching data for pool ID ${poolId}:`, error.message);
      consecutiveFailures++;
      restAddressIndex = (restAddressIndex + 1) % restAddresses.length; // Cycle through rest addresses
      if (consecutiveFailures >= maxRetries) {
        console.log(`Max retries reached for pool ID ${poolId}. Skipping to next pool ID.`);
        poolId++; // Skip to next pool ID after max retries
        consecutiveFailures = 0; // Reset failure count for the new pool ID
      }
      fiveMinWaitCount = await handleFailuresAndDelays(consecutiveFailures, fiveMinWaitCount); // Update wait count based on retries
    }
    await new Promise(resolve => setTimeout(resolve, 1000)); // 1-second delay between requests
  }
}

function formatData(responseData) {
  const pool = responseData.pool;
  let formattedData = {
    type: pool["@type"].includes("concentratedliquidity") ? "concentratedliquidity" : "gamm",
    id: pool.id,
    assets: {},
    fees: {
      swap_fee: pool["@type"].includes("concentratedliquidity") ? pool.spread_factor : pool.pool_params.swap_fee,
      exit_fee: pool["@type"].includes("gamm") ? pool.pool_params.exit_fee : "",
    },
    address: pool.address
  };

  // Dynamically handling tokens for both pool types
  if (pool["@type"].includes("concentratedliquidity")) {
    formattedData.assets.token1 = pool.token0;
    formattedData.assets.token2 = pool.token1;
  } else if (pool["@type"].includes("gamm")) {
    pool.pool_assets.forEach((asset, index) => {
      formattedData.assets[`token${index + 1}`] = asset.token.denom || "";
    });
  }

  console.log(`Formatted data for pool ID ${pool.id}:`, formattedData); // Logging the formatted data
  return formattedData;
}

async function handleFailuresAndDelays(consecutiveFailures, fiveMinWaitCount) {
  if (consecutiveFailures >= 10) {
    if (fiveMinWaitCount >= 3) {
      console.log('Waiting for 6 hours...');
      await new Promise(resolve => setTimeout(resolve, 21600000)); // 6 hours
      return 0; // Reset fiveMinWaitCount
    } else {
      console.log('Waiting for 5 minutes...');
      await new Promise(resolve => setTimeout(resolve, 300000)); // 5 minutes
      return fiveMinWaitCount + 1; // Increment fiveMinWaitCount
    }
  }
  return fiveMinWaitCount; // Return current count if no wait was triggered
}
