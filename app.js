const { readPoolsFile, writePoolsFile, fetchPoolData } = require('./utils');
const { restAddresses, initialRetryDelay, maxRetries, dataPath } = require('./config');

async function fetchAndProcessPoolData(startingPoolId) {
  let poolId = startingPoolId;
  let retryDelay = initialRetryDelay;
  let restAddressIndex = 0;
  let consecutiveFailures = 0;

  const existingData = readPoolsFile(dataPath) || { pools: [] };
  if (existingData.pools.length > 0) {
    const lastPool = existingData.pools[existingData.pools.length - 1];
    poolId = parseInt(lastPool.id) + 1;
    console.log(`Resuming from pool ID ${poolId}`);
  } else {
    console.log('Starting with pool ID 1');
  }

  while (true) {
    try {
      console.log(`Fetching data for pool ID ${poolId} from address index ${restAddressIndex}`);
      const responseData = await fetchPoolData(restAddresses[restAddressIndex], poolId);
      if (responseData && responseData.pool) {
        const formattedData = formatData(responseData);
        existingData.pools.push(formattedData);
        writePoolsFile(dataPath, existingData);
        console.log(`Successfully processed and saved pool ID ${poolId}`);
        poolId++;
        consecutiveFailures = 0; // Reset on success
        restAddressIndex = 0; // Reset to first REST address on success
        retryDelay = initialRetryDelay; // Reset retry delay on success
      } else {
        throw new Error('Invalid JSON response');
      }
    } catch (error) {
      console.error(`Error fetching data for pool ID ${poolId}:`, error.message);
      consecutiveFailures++;
      if (consecutiveFailures < maxRetries) {
        // Wait for retryDelay before next attempt
        await new Promise(resolve => setTimeout(resolve, retryDelay));
        retryDelay *= 2; // Double the retry delay for exponential backoff
      } else {
        console.log(`Max retries reached for pool ID ${poolId}. Skipping to next pool ID.`);
        poolId++;
        consecutiveFailures = 0; // Reset failure count for the new pool ID
        retryDelay = initialRetryDelay; // Reset retry delay for the new pool ID
      }
      restAddressIndex = (restAddressIndex + 1) % restAddresses.length; // Cycle through rest addresses
    }
    await new Promise(resolve => setTimeout(resolve, 100)); // Short delay between loop iterations
  }
}

function formatData(responseData) {
  if (!responseData || typeof responseData.pool === 'undefined') {
    throw new Error('Invalid or non-JSON response received');
  }

  const pool = responseData.pool;
  let formattedData = {
    id: pool.id || pool.pool_id, // Adjust for CosmWasmPool having pool_id instead of id
    address: pool.address || pool.contract_address, // Adjust for CosmWasmPool having contract_address
  };

  // Determine pool type and format data accordingly
  if (pool["@type"].includes("concentratedliquidity")) {
    formattedData.type = "concentratedliquidity";
    formattedData.assets = {
      token1: pool.token0,
      token2: pool.token1,
    };
    formattedData.fees = {
      swap_fee: pool.spread_factor,
      exit_fee: "",
    };
  } else if (pool["@type"].includes("/osmosis.gamm.poolmodels.stableswap.v1beta1.Pool")) {
    formattedData.type = "stableswap";
    formattedData.fees = {
      swap_fee: pool.pool_params.swap_fee,
      exit_fee: pool.pool_params.exit_fee,
    };
    formattedData.assets = {};
    pool.pool_liquidity.forEach((asset, index) => {
      formattedData.assets[`token${index + 1}`] = asset.denom || "";
    });
  } else if (pool["@type"].includes("/osmosis.cosmwasmpool.v1beta1.CosmWasmPool")) {
    formattedData.type = "cosmwasm-transmuter";
    // Only include pool_id and contract_address, already handled above
  } else if (pool["@type"].includes("gamm")) {
    formattedData.type = "gamm";
    formattedData.assets = {};
    formattedData.fees = {
      swap_fee: pool.pool_params.swap_fee,
      exit_fee: pool.pool_params.exit_fee,
    };
    pool.pool_assets.forEach((asset, index) => {
      formattedData.assets[`token${index + 1}`] = asset.token.denom || "";
    });
  } else {
    // Handle unexpected pool types or missing data gracefully
    throw new Error(`Unsupported pool type: ${pool["@type"]}`);
  }

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

fetchAndProcessPoolData(1)
  .then(() => console.log('Processing completed.'))
  .catch((error) => console.error('An error occurred:', error));
