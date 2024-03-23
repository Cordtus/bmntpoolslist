const restAddresses = [
  'https://rest-osmosis.ecostake.com',
  'https://osmosis-api.lavenderfive.com:443',
  'https://osmosis-lcd.quickapi.com:443',
  // Add more as needed
];

const config = {
  restAddresses,
  dataPath: './data/pools.json', // Data location
  initialRetryDelay: 1000, // Initial delay in milliseconds
  maxRetries: 5, // Maximum number of retries
  includeBaseDenom: true, // Option to include baseDenom field
  queryDelay: 2000, // Delay between queries in milliseconds
};

module.exports = config;
