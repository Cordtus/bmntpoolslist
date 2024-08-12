# Lazy Osmosis Pools List Generator

### Application Overview

This application is designed to fetch and process pool data from the Osmosis blockchain, specifically targeting liquidity pools. It handles the retrieval, formatting, and storage of data, cycling through multiple REST API endpoints to ensure robustness against failures.

### Setup Process

1. **Installation**: 
   - Clone the repository containing this code.
   - Ensure Node.js is installed on your system.
   - Install the necessary dependencies by running `npm install` in the project directory. The main dependency is `node-fetch` for handling HTTP requests.

2. **Configuration**: 
   - The configuration of REST API endpoints is managed in the `config.js` file. Update the `restAddresses` array with the appropriate REST endpoints for fetching Osmosis pool data.

3. **Data Directory Setup**: 
   - The application ensures that a `data` directory exists in the project root. This directory will contain a `pools.json` file where the fetched pool data will be stored.

### How It Works

1. **Initial Setup**:
   - The application starts by checking for an existing `pools.json` file. If it exists, it reads the last processed pool ID to resume fetching from where it left off. If the file doesn't exist, it creates a new one and starts from pool ID 1.

2. **Data Fetching and Processing**:
   - The main function `fetchAndProcessPoolData` is responsible for fetching data for each pool starting from the specified pool ID. 
   - It cycles through the provided REST endpoints (`restAddresses`) to fetch data, ensuring redundancy in case an endpoint fails.
   - For each pool, it formats the data based on the pool type (either concentrated liquidity or GAMM) and appends it to the `pools.json` file.

3. **Error Handling**:
   - The application includes robust error handling with retry logic. If a fetch operation fails, it retries up to 5 times before moving to the next pool ID or switching to the next REST endpoint.
   - After a certain number of consecutive failures, the application introduces delays (5 minutes or 6 hours) to avoid overwhelming the endpoints and to allow any temporary issues to resolve.

4. **Output**:
   - The processed data for each pool is stored in the `pools.json` file within the `data` directory. This JSON file contains an array of pool objects, each formatted with relevant details like pool type, assets, fees, and address.

### Key Functions

- **`readPoolsFile()`**: Reads the existing `pools.json` file or initializes a new one if it doesn't exist.
- **`writePoolsFile()`**: Writes the fetched and formatted pool data back to the `pools.json` file.
- **`fetchPoolData()`**: Fetches pool data from the specified REST API endpoint.
- **`formatData()`**: Formats the raw data received from the API into a structured JSON object.
- **`handleFailuresAndDelays()`**: Manages delays and retries based on consecutive failures.

### Data Output

The output of this application is a `pools.json` file containing a collection of pool data objects. Each object includes:
- Pool type (`concentratedliquidity` or `gamm`)
- Pool ID
- Associated assets (e.g., token1, token2)
- Fees (swap fee, exit fee)
- Pool address

This data can be used for analysis, reporting, or further processing as needed.
