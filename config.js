const config = {
  dataPath: './data/pools.json', // Data location
  initialRetryDelay: 1000, // Initial delay in milliseconds
  maxRetries: 5, // Maximum number of retries
  includeBaseDenom: true, // Option to include baseDenom field
  queryDelay: 150, // Delay between queries in milliseconds
};

module.exports = config;
