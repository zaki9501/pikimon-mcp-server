# MCP Server

A Node.js server for interacting with the Monad Testnet blockchain network. This server provides a REST API interface for common blockchain operations.

## Features

- Express.js REST API
- Web3.js integration for blockchain interaction
- Environment variable configuration
- Basic blockchain operations (get balance, send transactions, etc.)
- Security middleware (helmet, cors)

## Prerequisites

- Node.js (v16 or higher)
- npm (v8 or higher)
- Access to a Monad Testnet node

## Installation

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

## Usage

Start the development server:
```bash
npm run dev
```

Start the production server:
```bash
npm start
```

## API Endpoints

- GET `/health` - Check server health
- GET `/blockchain/block-number` - Get current block number
- GET `/blockchain/balance/:address` - Get balance for an address
- POST `/blockchain/send-transaction` - Send a transaction

## License

ISC 