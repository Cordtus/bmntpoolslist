// Import necessary functions from utils and configurations from config
const { readPoolsFile, writePoolsFile, fetchPoolData, fetchBaseDenom } = require('./utils');
const { restAddresses, initialRetryDelay, maxRetries, includeBaseDenom, queryDelay } = require('./config');

async function fetchAndProcessPoolData(startingPoolId) {
  let poolId = startingPoolId;
  let retryDelay = initialRetryDelay;
  let restAddressIndex = 0;
  let consecutiveFailures = 0;

  // Load existing data or initialize an empty array for pools
  const existingData = readPoolsFile() || { pools: [] };

  while (true) {
    try {
      console.log(`Fetching data for pool ID ${poolId} from address index ${restAddressIndex}`);
      const responseData = await fetchPoolData(restAddresses[restAddressIndex], poolId);

      if (responseData && responseData.pool) {
        let formattedData = formatData(responseData);

        // Enrich formattedData with base denomination if configured to do so
        if (includeBaseDenom) {
          await enrichWithBaseDenom(formattedData, restAddresses[restAddressIndex]);
        }

        existingData.pools.push(formattedData);
        writePoolsFile(existingData);
        console.log(`Successfully processed and saved pool ID ${poolId}`);

        poolId++; // Proceed to the next pool ID
        consecutiveFailures = 0; // Reset failure counter on success
        retryDelay = initialRetryDelay; // Reset retry delay on success
      } else {
        throw new Error('Invalid JSON response');
      }
    } catch (error) {
      console.error(`Error fetching data for pool ID ${poolId}:`, error.message);
      consecutiveFailures++;

      if (consecutiveFailures < maxRetries) {
        await new Promise(resolve => setTimeout(resolve, retryDelay));
        retryDelay *= 2; // Exponential backoff
      } else {
        console.log(`Max retries reached for pool ID ${poolId}. Skipping to next pool ID.`);
        poolId++;
        consecutiveFailures = 0;
        retryDelay = initialRetryDelay;
      }

      restAddressIndex = (restAddressIndex + 1) % restAddresses.length;
    }

    await new Promise(resolve => setTimeout(resolve, 100)); // Short delay between iterations to control the loop's pace
  }
}

async function enrichWithBaseDenom(formattedData, restAddress) {
  for (const asset of formattedData.assets) {
    if (asset.denom.startsWith('ibc/')) {
      const ibcId = asset.denom.split('/')[1]; // Correctly extract the IBC hash
      try {
        const baseDenom = await fetchBaseDenom(restAddress, ibcId); // Fetch the base denomination
        asset.baseDenom = baseDenom; // Append base denomination to the asset
        await new Promise(resolve => setTimeout(resolve, queryDelay)); // Wait to avoid rate limiting
      } catch (error) {
        console.error(`Error fetching base denom for ${asset.denom}:`, error);
      }
    }
  }
}

function formatData(responseData) {
  if (!responseData || typeof responseData.pool === 'undefined') {
    throw new Error('Invalid or non-JSON response received');
  }

  const pool = responseData.pool;
  let formattedData = {
    id: pool.id || pool.pool_id,
    address: pool.address || pool.contract_address,
    type: pool["@type"].includes("concentratedliquidity") ? "concentratedliquidity" : "gamm",
    assets: pool.pool_assets.map((asset, index) => ({
      denom: asset.token.denom,
      amount: asset.token.amount
    })),
    fees: {
      swap_fee: pool["@type"].includes("concentratedliquidity") ? pool.spread_factor : pool.pool_params.swap_fee,
      exit_fee: pool["@type"].includes("gamm") ? pool.pool_params.exit_fee : "",
    }
  };

  console.log(`Formatted data for pool ID ${pool.id}:`, formattedData);
  return formattedData;
}

// Start the data fetching and processing with the first pool ID
fetchAndProcessPoolData(1)
  .then(() => console.log('Processing completed.'))
  .catch((error) => console.error('An error occurred:', error));
