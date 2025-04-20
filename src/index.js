import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import swaggerUi from 'swagger-ui-express';
import blockchain from './routes/blockchain.js';
import actionsRoutes from './routes/actions.js';
import logger from './utils/logger.js';
import ensureLogDir from './utils/ensureLogDir.js';
import swaggerSpec from './config/swagger.js';
import WebSocketService from './services/websocket.js';
import monadService from './services/monad.js';
import stdioService from './services/stdioService.js';
import axios from 'axios';

// Ensure logs directory exists
ensureLogDir();

// Load environment variables
dotenv.config();

// Initialize stdio transport if enabled
if (process.env.ENABLE_STDIO === 'true') {
  stdioService.initialize();
  logger.info('Stdio transport enabled and initialized');
}

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const app = express();
const port = parseInt(process.env.PORT || '3001');
const host = process.env.HOST || '0.0.0.0';

// Middleware
app.use(helmet({
  crossOriginResourcePolicy: false,
  crossOriginOpenerPolicy: false
}));
app.use(cors({
  origin: '*',
  methods: ['GET', 'POST', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// SSE clients for block updates
const sseClients = new Set();

// SSE endpoint for block updates (existing)
app.get('/sse', async (req, res) => {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type'
  });

  const sendInitialData = async () => {
    try {
      const blockNumber = (await monadService.getLatestBlockNumber()).toString();
      res.write(`data: ${JSON.stringify({
        type: 'current_block',
        data: { blockNumber }
      })}\n\n`);

      const greeting = await monadService.getData();
      if (greeting) {
        res.write(`data: ${JSON.stringify({
          type: 'current_greeting',
          data: { greeting }
        })}\n\n`);
      }
    } catch (error) {
      logger.error('Error sending initial SSE data:', { error: error.message });
      res.write(`data: ${JSON.stringify({
        type: 'error',
        data: { message: 'Failed to fetch initial data, will retry shortly' }
      })}\n\n`);
      setTimeout(sendInitialData, 5000);
    }
  };

  await sendInitialData();

  const heartbeat = setInterval(() => {
    res.write(':\n\n');
  }, 30000);

  sseClients.add(res);
  logger.info('New SSE client connected');

  if (sseClients.size === 1) {
    startBlockPolling();
  }

  req.on('close', () => {
    clearInterval(heartbeat);
    sseClients.delete(res);
    logger.info('SSE client disconnected');
    if (sseClients.size === 0) {
      stopBlockPolling();
    }
  });
});

// Backward compatibility for /api/events
app.get('/api/events', (req, res) => {
  res.redirect(307, '/sse');
});

// Block polling for SSE
let blockPollingInterval = null;
let lastBlock = null;
let consecutiveErrors = 0;
const MAX_CONSECUTIVE_ERRORS = 3;
const POLLING_INTERVAL = 2000;
const ERROR_POLLING_INTERVAL = 5000;

const startBlockPolling = async () => {
  if (blockPollingInterval) return;

  try {
    lastBlock = (await monadService.getLatestBlockNumber()).toString();
    
    const poll = async () => {
      try {
        const currentBlock = (await monadService.getLatestBlockNumber()).toString();
        if (BigInt(currentBlock) > BigInt(lastBlock)) {
          const block = await monadService.web3.eth.getBlock(currentBlock, true);
          if (block) {
            const blockInfo = {
              number: block.number.toString(),
              hash: block.hash,
              timestamp: block.timestamp.toString(),
              gasUsed: (block.gasUsed || '0').toString(),
              miner: block.miner,
              baseFeePerGas: block.baseFeePerGas ? block.baseFeePerGas.toString() : '0',
              difficulty: block.difficulty ? block.difficulty.toString() : '0',
              totalDifficulty: block.totalDifficulty ? block.totalDifficulty.toString() : '0'
            };

            const eventData = JSON.stringify({
              type: 'newBlock',
              data: blockInfo
            });

            sseClients.forEach(client => {
              client.write(`data: ${eventData}\n\n`);
            });

            lastBlock = currentBlock;
            logger.info('New block broadcast to SSE clients:', { blockNumber: blockInfo.number });
          }
        }
        consecutiveErrors = 0;
        blockPollingInterval = setTimeout(poll, POLLING_INTERVAL);
      } catch (error) {
        logger.error('Error in SSE block polling:', { error: error.message });
        consecutiveErrors++;

        if (consecutiveErrors >= MAX_CONSECUTIVE_ERRORS) {
          const errorData = JSON.stringify({
            type: 'error',
            data: { message: 'Experiencing temporary issues with block updates' }
          });
          sseClients.forEach(client => {
            client.write(`data: ${errorData}\n\n`);
          });
        }

        blockPollingInterval = setTimeout(poll, ERROR_POLLING_INTERVAL);
      }
    };

    await poll();
    logger.info('SSE block polling started');
  } catch (error) {
    logger.error('Error starting SSE block polling:', { error: error.message });
    setTimeout(startBlockPolling, ERROR_POLLING_INTERVAL);
  }
};

const stopBlockPolling = () => {
  if (blockPollingInterval) {
    clearTimeout(blockPollingInterval);
    blockPollingInterval = null;
    consecutiveErrors = 0;
    logger.info('SSE block polling stopped');
  }
};

// Event listener for greeting updates
monadService.on('greetingUpdated', (eventData) => {
  const data = JSON.stringify({
    type: 'greeting_updated',
    data: eventData
  });
  
  sseClients.forEach(client => {
    client.write(`data: ${data}\n\n`);
  });
});

// MCP SSE clients set
const mcpClients = new Set();

// MCP SSE endpoint
app.get('/mcp-sse', (req, res) => {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
    'Access-Control-Allow-Origin': '*'
  });

  const clientId = Date.now().toString();
  mcpClients.add(res);

  // Send initial connection message
  const initMessage = {
    jsonrpc: "2.0",
    id: 0,
    result: {
      status: "connected",
      clientId: clientId,
      serverInfo: {
        name: "pikimon-mcp-server",
        version: "2.0",
        transport: "sse"
      }
    }
  };
  res.write(`data: ${JSON.stringify(initMessage)}\n\n`);

  // Keep connection alive with heartbeat
  const heartbeat = setInterval(() => {
    const heartbeatMsg = {
      jsonrpc: "2.0",
      method: "heartbeat",
      params: {
        timestamp: Date.now(),
        status: "alive"
      }
    };
    res.write(`data: ${JSON.stringify(heartbeatMsg)}\n\n`);
  }, 30000);

  // Handle block updates
  const blockUpdateHandler = async (blockNumber) => {
    try {
      const block = await monadService.web3.eth.getBlock(blockNumber, true);
      if (block) {
        const blockMsg = {
          jsonrpc: "2.0",
          method: "block/new",
          params: {
            block: {
              number: block.number.toString(),
              hash: block.hash,
              timestamp: block.timestamp.toString(),
              transactions: block.transactions.length
            }
          }
        };
        res.write(`data: ${JSON.stringify(blockMsg)}\n\n`);
      }
    } catch (error) {
      logger.error('Error handling block update:', { error: error.message });
    }
  };

  // Handle greeting updates
  const greetingUpdateHandler = (greeting) => {
    const greetingMsg = {
      jsonrpc: "2.0",
      method: "greeting/update",
      params: {
        greeting: greeting
      }
    };
    res.write(`data: ${JSON.stringify(greetingMsg)}\n\n`);
  };

  // Subscribe to events
  monadService.on('newBlock', blockUpdateHandler);
  monadService.on('greetingUpdated', greetingUpdateHandler);

  // Start block polling if this is the first client
  if (mcpClients.size === 1) {
    startBlockPolling();
  }

  // Cleanup on connection close
  req.on('close', () => {
    clearInterval(heartbeat);
    mcpClients.delete(res);
    monadService.off('newBlock', blockUpdateHandler);
    monadService.off('greetingUpdated', greetingUpdateHandler);
    
    // Stop polling if no clients left
    if (mcpClients.size === 0) {
      stopBlockPolling();
    }
    
    logger.info('MCP SSE client disconnected:', { clientId });
  });

  logger.info('MCP SSE client connected:', { clientId });
});

// Handle MCP JSON-RPC requests
app.post('/mcp', async (req, res) => {
  const request = req.body;

  // Basic JSON-RPC validation
  if (!request.jsonrpc || request.jsonrpc !== '2.0' || !request.method || !('id' in request)) {
    return res.status(400).json({
      jsonrpc: '2.0',
      id: request.id || null,
      error: {
        code: -32600,
        message: 'Invalid Request'
      }
    });
  }

  try {
    let response;
    
    switch (request.method) {
      case 'block/latest':
        const blockNumber = await monadService.getLatestBlockNumber();
        response = {
          jsonrpc: '2.0',
          id: request.id,
          result: {
            blockNumber: blockNumber.toString()
          }
        };
        break;

      case 'greeting/get':
        const greeting = await monadService.getData();
        response = {
          jsonrpc: '2.0',
          id: request.id,
          result: {
            greeting: greeting || ''
          }
        };
        break;

      default:
        response = {
          jsonrpc: '2.0',
          id: request.id,
          error: {
            code: -32601,
            message: 'Method not found'
          }
        };
    }

    return res.json(response);
  } catch (error) {
    logger.error('Error handling MCP request:', { error: error.message });
    return res.status(500).json({
      jsonrpc: '2.0',
      id: request.id,
      error: {
        code: -32000,
        message: 'Server error'
      }
    });
  }
});

// Routes
app.use('/api', blockchain);
app.use('/api', actionsRoutes);

// Swagger documentation
app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec));

// Root endpoint
app.get('/', (req, res) => {
  logger.info('Root endpoint accessed');
  const serverHost = process.env.HOST === '0.0.0.0' ? req.hostname : process.env.HOST;
  const serverPort = process.env.PORT || '3001';
  const wsPort = process.env.WS_PORT || '8081';

  res.json({ 
    message: 'MCP Server is running!',
    server: {
      version: '1.0.0',
      host: serverHost,
      port: serverPort
    },
    endpoints: {
      documentation: `http://${serverHost}:${serverPort}/api-docs`,
      websocket: `ws://${serverHost}:${wsPort}`,
      sse: `http://${serverHost}:${serverPort}/sse`,
      mcpSse: `http://${serverHost}:${serverPort}/mcp-sse`,
      health: `http://${serverHost}:${serverPort}/health`,
      api: `http://${serverHost}:${serverPort}/api`
    },
    features: {
      websocket: true,
      sse: true,
      mcp: true,
      swagger: true,
      realTimeUpdates: true
    }
  });
});

// Health check endpoint
app.get('/health', (req, res) => {
  logger.info('Health check endpoint accessed');
  res.status(200).json({ status: 'ok' });
});

// 404 handler
app.use((req, res) => {
  logger.warn(`404 - Not Found - ${req.originalUrl}`);
  res.status(404).json({ 
    success: false,
    error: 'Not Found'
  });
});

// Error handling middleware
app.use((err, req, res, next) => {
  logger.error('Server error:', { error: err.message, stack: err.stack });
  res.status(500).json({ 
    success: false,
    error: 'Something went wrong!'
  });
});

// Initialize WebSocket server
const wsService = new WebSocketService();

// Handle graceful shutdown
process.on('SIGTERM', () => {
  logger.info('SIGTERM received. Shutting down gracefully...');
  wsService.close();
  process.exit(0);
});

process.on('SIGINT', () => {
  logger.info('SIGINT received. Shutting down gracefully...');
  wsService.close();
  process.exit(0);
});

function startServer(port) {
  try {
    logger.info(`Attempting to start server on port ${port}...`);
    const server = app.listen(port, host, () => {
      logger.info(`Server is running on http://${host}:${port}`);
      logger.info(`SSE endpoint available at http://${host}:${port}/sse`);
      logger.info(`MCP SSE endpoint available at http://${host}:${port}/mcp-sse`);
      logger.info(`API Documentation available at http://${host}:${port}/api-docs`);
      logger.info(`Monad RPC URL: ${process.env.MONAD_RPC_URL || 'http://localhost:8545'}`);
      
      // Initialize WebSocket service after server starts
      try {
        wsService.initialize();
      } catch (wsError) {
        logger.error('Failed to initialize WebSocket service:', { error: wsError.message });
      }
    });

    server.on('error', (error) => {
      if (error.code === 'EADDRINUSE') {
        logger.error(`Port ${port} is already in use. Please check if another instance is running.`);
        process.exit(1);
      } else {
        logger.error('Failed to start server:', { error: error.message });
        throw error;
      }
    });
  } catch (error) {
    logger.error('Error starting server:', { error: error.message });
    throw error;
  }
}

// Start the server
startServer(port);