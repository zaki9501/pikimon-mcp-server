import WebSocket from 'ws';
import logger from '../utils/logger.js';
import monadService from './monad.js';
import dotenv from 'dotenv';

dotenv.config();

class WebSocketService {
  constructor() {
    this.wss = null;
    this.clients = new Set();
    this.subscription = null;
  }

  initialize(server) {
    try {
      const wsPort = process.env.WS_PORT || 8081;
      this.wss = new WebSocket.Server({ port: wsPort });

      this.wss.on('connection', (ws) => {
        this.clients.add(ws);
        logger.info('WebSocket client connected');

        ws.on('message', (message) => {
          try {
            const data = JSON.parse(message);
            logger.info('Received WebSocket message:', data);
            // Handle message types here
          } catch (error) {
            logger.error('Error processing WebSocket message:', error);
          }
        });

        ws.on('close', () => {
          this.clients.delete(ws);
          logger.info('WebSocket client disconnected');
        });

        ws.on('error', (error) => {
          logger.error('WebSocket client error:', error);
          this.clients.delete(ws);
        });

        // Send initial connection success message
        ws.send(JSON.stringify({
          type: 'connection',
          status: 'connected',
          timestamp: Date.now()
        }));
      });

      this.wss.on('error', (error) => {
        logger.error('WebSocket server error:', error);
      });

      logger.info(`WebSocket server started on port ${wsPort}`);
    } catch (error) {
      logger.error('Failed to initialize WebSocket server:', error);
      throw error;
    }
  }

  setupEventListeners() {
    try {
      // Listen for greeting updates from MonadService
      monadService.on('greetingUpdated', (eventData) => {
        logger.info('Broadcasting greeting update to clients');
        this.broadcast({
          type: 'greeting_updated',
          data: eventData
        });
      });

      // Listen for event listening disabled notification
      monadService.on('eventListeningDisabled', () => {
        logger.info('Event listening is disabled - GreetingUpdated event not found in contract ABI');
        this.broadcast({
          type: 'system_notification',
          data: {
            message: 'Event listening disabled - contract does not support GreetingUpdated events'
          }
        });
      });

      logger.info('Event listeners setup completed');
    } catch (error) {
      logger.warn('Error setting up event listeners:', { error: error.message });
    }
  }

  async sendInitialData(ws) {
    try {
      // Get and send current block number
      const blockNumber = await monadService.getLatestBlockNumber();
      this.sendToClient(ws, {
        type: 'current_block',
        data: { blockNumber }
      });

      // Get and send current greeting
      const greeting = await monadService.getData();
      this.sendToClient(ws, {
        type: 'current_greeting',
        data: { greeting }
      });
    } catch (error) {
      logger.error('Error sending initial data:', { error: error.message });
    }
  }

  async startBlockHeaderSubscription() {
    try {
      if (this.subscription) {
        logger.warn('Block header subscription already exists, stopping previous subscription');
        await this.stopBlockHeaderSubscription();
      }

      // For Monad testnet or when WebSocket is not available, use polling
      if (!monadService.web3Ws || monadService.isMonadTestnet) {
        logger.info('Starting block header polling');
        let lastBlock = await monadService.getLatestBlockNumber();
        
        this.subscription = {
          isPolling: true,
          active: true,
          interval: setInterval(async () => {
            try {
              const currentBlock = await monadService.getLatestBlockNumber();
              if (currentBlock > lastBlock) {
                const block = await monadService.web3.eth.getBlock(currentBlock, true);
                if (block) {
                  this.handleNewBlock(block);
                  lastBlock = currentBlock;
                }
              }
            } catch (error) {
              logger.error('Error in block polling:', { error: error.message });
            }
          }, 2000) // Poll every 2 seconds for Monad testnet
        };

        logger.info('Block header polling started successfully');
        return;
      }

      // Try WebSocket subscription if available
      logger.info('Starting block header subscription via WebSocket');
      this.subscription = await monadService.web3Ws.eth.subscribe('newBlockHeaders', (error, blockHeader) => {
        if (error) {
          logger.error('Error in block header subscription:', { error: error.message });
          return;
        }
        
        if (!blockHeader) {
          logger.warn('Received empty block header');
          return;
        }

        this.handleNewBlock(blockHeader);
      });

      if (!this.subscription || typeof this.subscription.unsubscribe !== 'function') {
        throw new Error('Failed to create valid subscription');
      }

      logger.info('Block header subscription started successfully via WebSocket');
    } catch (error) {
      logger.error('Error starting block header subscription:', { error: error.message });
      
      // If WebSocket subscription fails, fall back to polling
      if (!this.subscription || !this.subscription.isPolling) {
        logger.info('Falling back to polling due to subscription error');
        await this.startBlockHeaderSubscription();
      } else {
        this.subscription = null;
        throw error;
      }
    }
  }

  handleNewBlock(blockHeader) {
    // Format block data to ensure consistent string representation
    const blockInfo = {
      number: blockHeader.number.toString(),
      hash: blockHeader.hash,
      timestamp: blockHeader.timestamp.toString(),
      gasUsed: (blockHeader.gasUsed || '0').toString(),
      miner: blockHeader.miner
    };

    this.broadcast(JSON.stringify({
      type: 'newBlock',
      data: blockInfo
    }));

    logger.info('New block received:', { blockNumber: blockInfo.number });
  }

  stopBlockHeaderSubscription() {
    if (!this.subscription) {
      return;
    }

    logger.info('Stopping block header subscription/polling');
    
    try {
      if (this.subscription.isPolling) {
        // Stop polling
        clearInterval(this.subscription.interval);
        this.subscription.active = false;
        logger.info('Block header polling stopped');
      } else if (typeof this.subscription.unsubscribe === 'function') {
        // Stop WebSocket subscription
        this.subscription.unsubscribe((error, success) => {
          if (error) {
            logger.error('Error unsubscribing from block headers:', { error: error.message });
          } else {
            logger.info('Successfully unsubscribed from block headers');
          }
        });
      }
    } catch (error) {
      logger.error('Error during unsubscribe operation:', { error: error.message });
    }

    this.subscription = null;
  }

  broadcast(message) {
    if (!this.wss) {
      logger.warn('WebSocket server not initialized');
      return;
    }

    this.clients.forEach((client) => {
      if (client.readyState === WebSocket.OPEN) {
        try {
          client.send(JSON.stringify(message));
        } catch (error) {
          logger.error('Error broadcasting to client:', error);
        }
      }
    });
  }

  sendToClient(ws, message) {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(message));
    }
  }

  close() {
    this.stopBlockHeaderSubscription();
    if (this.wss) {
      this.clients.forEach((client) => {
        try {
          client.close();
        } catch (error) {
          logger.error('Error closing client connection:', error);
        }
      });
      this.clients.clear();

      this.wss.close(() => {
        logger.info('WebSocket server closed');
      });
      this.wss = null;
    }
  }
}

export default WebSocketService; 