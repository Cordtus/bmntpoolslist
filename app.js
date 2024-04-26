// Import necessary functions from utils and configurations from config
const { queryCosmWasmPool, fetchRestAddresses, readPoolsFile, writePoolsFile, fetchPoolData, fetchBaseDenom } = require('./utils');
const { initialRetryDelay, maxRetries, includeBaseDenom, queryDelay } = require('./config');

async function initializeApp() {
  try {
      const addresses = await fetchRestAddresses();
      if (addresses.length > 0) {
          restAddresses = addresses; // Update the global restAddresses array
      } else {
          console.log("Using default REST addresses due to fetching failure.");
      }
      // Start the data fetching and processing with the first pool ID
      fetchAndProcessPoolData(1)
          .then(() => console.log('Processing completed.'))
          .catch((error) => console.error('An error occurred:', error));
  } catch (error) {
      console.error('Error during application initialization:', error);
  }
}

// Call initializeApp to start everything
initializeApp();

const nodeStatus = {}; // Keeps track of node health and blackout status

async function fetchAndProcessPoolData(startingPoolId) {
  let poolId = startingPoolId;
  let restAddressIndex = 0;
  let retries = 0;
  const maxNodeFailures = 3; // Threshold for blacklisting a node
  const blacklistDuration = 3600000; // 1 hour in milliseconds

  // Load existing data or initialize an empty array for pools
  const existingData = readPoolsFile() || { pools: [] };

  while (true) {
    const currentAddress = restAddresses[restAddressIndex];
    if (nodeStatus[currentAddress] && Date.now() - nodeStatus[currentAddress].blacklistedAt < blacklistDuration) {
      // Skip blacklisted nodes
      restAddressIndex = (restAddressIndex + 1) % restAddresses.length;
      continue;
    }

    try {
      console.log(`Fetching data for pool ID ${poolId} from address ${currentAddress}`);
      const responseData = await fetchPoolData(currentAddress, poolId);

      if (responseData && responseData.pool) {
        let formattedData = formatData(responseData);
        if (includeBaseDenom) {
          await enrichWithBaseDenom(formattedData, currentAddress);
        }
        
        existingData.pools.push(formattedData);
        writePoolsFile(existingData);
        console.log(`Successfully processed and saved pool ID ${poolId}`);

        poolId++; // Move to the next pool ID
        retries = 0; // Reset retries for next ID
        nodeStatus[currentAddress] = { failures: 0 }; // Reset failures on success
      } else {
        throw new Error('Invalid JSON response');
      }
    } catch (error) {
      console.error(`Error fetching data for pool ID ${poolId}:`, error.message);
      retries++;
      nodeStatus[currentAddress] = nodeStatus[currentAddress] || { failures: 0, blacklistedAt: 0 };
      nodeStatus[currentAddress].failures++;

      if (nodeStatus[currentAddress].failures >= maxNodeFailures) {
        nodeStatus[currentAddress].blacklistedAt = Date.now();
        console.log(`Blacklisting ${currentAddress} due to repeated failures.`);
      }

      // Cycle to next address
      restAddressIndex = (restAddressIndex + 1) % restAddresses.length;
      if (retries >= restAddresses.length) {
        console.log(`All nodes have been tried for pool ID ${poolId}. Skipping to next pool ID.`);
        poolId++; // Skip this pool ID after all nodes have failed
        retries = 0; // Reset retries for the new pool ID
      }
    }

    await new Promise(resolve => setTimeout(resolve, 100)); // Short delay between iterations
  }
}

async function processCosmWasmPool(poolData, restAddress) {
  const { contract_address: contractAddress, pool_id: poolId } = poolData;
  const query = { "get_total_pool_liquidity": {} };
  const cwResponse = await queryCosmWasmPool(restAddress, contractAddress, query);
  const liquidityData = cwResponse.data.total_pool_liquidity;

  let assets = [];
  for (let asset of liquidityData) {
      let baseDenom = asset.denom;
      if (asset.denom.startsWith('ibc/')) {
          baseDenom = await fetchBaseDenom(restAddress, asset.denom.split('/')[1]); // Assuming fetchBaseDenom handles IBC hashing.
      }
      assets.push({
          denom: asset.denom,
          amount: asset.amount,
          baseDenom: baseDenom || undefined
      });
  }

  return {
      id: poolId,
      address: contractAddress,
      type: "cosmwasm",
      assets: assets,
      fees: {
          swap_fee: "Unknown",
          exit_fee: "Unknown"
      }
  };
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
