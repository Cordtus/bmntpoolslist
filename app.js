const { readPoolsFile, writePoolsFile, fetchPoolData, fetchBaseDenom } = require('./utils');
const { restAddresses, initialRetryDelay, maxRetries, dataPath, includeBaseDenom, queryDelay } = require('./config');

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
        let baseDenoms = {};
        if (includeBaseDenom) {
          for (const asset of responseData.pool.pool_assets || []) {
            if (asset.token.denom.startsWith('ibc/')) {
              const ibcId = asset.token.denom.split('/')[1]; // Extract the IBC hash part
              try {
                const baseDenom = await fetchBaseDenom(restAddresses[restAddressIndex], ibcId);
                baseDenoms[asset.token.denom] = baseDenom; // Map ibc denom to base denom
                await new Promise(resolve => setTimeout(resolve, queryDelay)); // Delay to respect rate limiting
              } catch (error) {
                console.error(`Error fetching base denom for ${ibcId}:`, error);
                // Continue processing other assets without failing the entire operation
              }
            }
          }
        }

        const formattedData = formatData(responseData, baseDenoms);
        existingData.pools.push(formattedData);
        writePoolsFile(existingData);
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

function formatData(responseData, baseDenoms) {
  if (!responseData || typeof responseData.pool === 'undefined') {
    throw new Error('Invalid or non-JSON response received');
  }

  const pool = responseData.pool;
  let formattedData = {
    id: pool.id || pool.pool_id,
    address: pool.address || pool.contract_address,
    type: "",
    assets: [],
    fees: {}
  };

  // Logic to determine pool type and format data accordingly, similar to existing implementation
  // Add base denom information where applicable
  if (pool.pool_assets) {
    pool.pool_assets.forEach((asset, index) => {
      let assetInfo = {
        denom: asset.token.denom,
        amount: asset.token.amount
      };
      if (baseDenoms && baseDenoms[asset.token.denom]) {
        assetInfo.baseDenom = baseDenoms[asset.token.denom];
      }

