# MCP Server

A Node.js server for interacting with the Monad Testnet blockchain network. This server provides a REST API interface for common blockchain operations.

## Features

- Express.js REST API
- Web3.js integration for blockchain interaction
- Environment variable configuration
- Basic blockchain operations (get balance, send transactions, etc.)
- Security middleware (helmet, cors)
- Swagger API documentation
- Docker support

## Prerequisites

- Node.js (v16 or higher) OR Docker
- npm (v8 or higher) if not using Docker
- Access to a Monad Testnet node

## Installation

### Standard Installation

1. Clone the repository:
   ```bash
   git clone <repository-url>
   cd mcp-server
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Create environment file:
   ```bash
   cp .env.example .env
   ```

4. Configure your environment variables in `.env`:
   - Set `MONAD_RPC_URL` to your Monad Testnet node URL
   - Set `PORT` if you want to use a different port
   - Add `PRIVATE_KEY` if needed for signing transactions

### Docker Installation

1. Clone the repository:
   ```bash
   git clone <repository-url>
   cd mcp-server
   ```

2. Create and configure environment file:
   ```bash
   cp .env.example .env
   # Edit .env with your configuration
   ```

3. Build the Docker image:
   ```bash
   docker build -t mcp-server .
   ```

4. Run the container:
   ```bash
   docker run -d \
     --name mcp-server \
     -p 3000:3000 \
     --env-file .env \
     -v $(pwd)/logs:/app/logs \
     mcp-server
   ```

## Usage

### Standard Usage

Start the development server:
```bash
npm run dev
```

Start the production server:
```bash
npm start
```

### Docker Usage

Start the container:
```bash
docker start mcp-server
```

Stop the container:
```bash
docker stop mcp-server
```

View logs:
```bash
docker logs mcp-server
```

## API Documentation

The API documentation is available at `/api-docs` when the server is running. Visit:
```
http://localhost:3000/api-docs
```

## API Endpoints

- GET `/health` - Check server health
- GET `/blockchain/latest-block` - Get current block number
- GET `/blockchain/analyze-block/:blockNumber` - Get block analysis
- POST `/blockchain/store-data` - Store data in contract
- GET `/blockchain/get-data` - Get stored data
- POST `/actions/execute-chain` - Execute chain of operations
- GET `/actions/parallel-block-analysis` - Analyze multiple blocks

## Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| PORT | Server port | 3000 |
| NODE_ENV | Environment mode | development |
| MONAD_RPC_URL | Monad Testnet RPC URL | http://localhost:8545 |
| CONTRACT_ADDRESS | Smart contract address | - |
| CONTRACT_ABI | Smart contract ABI | - |
| LOG_LEVEL | Logging level | info |

## Docker Volumes

The container uses the following volume:
- `/app/logs`: Contains application logs (combined.log and error.log)

## License

ISC 