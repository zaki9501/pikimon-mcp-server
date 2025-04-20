import Web3 from 'web3';
import axios from 'axios';
import dotenv from 'dotenv';
import logger from '../utils/logger.js';
import { contractConfig } from '../config/contractConfig.js';
import EventEmitter from 'events';
import WebSocket from 'ws';

dotenv.config();

class MonadService extends EventEmitter {
  constructor() {
    super();
    const httpRpcUrl = process.env.MONAD_RPC_URL || 'http://localhost:8545';
    
    this.blockvisionApiKey = process.env.BLOCKVISION_API_KEY;
    this.blockvisionBaseUrl = 'https://api.blockvision.org/v2/monad';
    this.globalMcpUrl = process.env.GLOBAL_MCP_URL;
    this.serverIdentifier = process.env.SERVER_IDENTIFIER || `mcp-${Date.now()}`;
    this.globalMcpEnabled = process.env.ENABLE_GLOBAL_MCP === 'true';
    
    // Rate limiting settings
    this.requestQueue = [];
    this.isProcessingQueue = false;
    this.lastRequestTime = 0;
    this.minRequestInterval = 1000; // Minimum 1 second between requests
    this.maxRetries = 3;
    this.retryDelay = 2000; // 2 seconds between retries
    
    // Initialize Web3 with HTTP provider
    this.web3 = new Web3(httpRpcUrl);
    
    // Cache for frequently requested data
    this.cache = {
      latestBlock: {
        value: null,
        timestamp: 0,
        ttl: 2000 // 2 seconds TTL
      },
      greeting: {
        value: null,
        timestamp: 0,
        ttl: 5000 // 5 seconds TTL
      }
    };
    
    this.blockvisionApiKey = process.env.BLOCKVISION_API_KEY;
    this.blockvisionBaseUrl = 'https://api.blockvision.org/v2/monad';
    this.globalMcpUrl = process.env.GLOBAL_MCP_URL;
    this.serverIdentifier = process.env.SERVER_IDENTIFIER || `mcp-${Date.now()}`;
    this.globalMcpEnabled = process.env.ENABLE_GLOBAL_MCP === 'true';
    
    // Set default gas settings
    this.defaultGasPrice = '1000000000'; // 1 Gwei
    this.defaultGasLimit = '100000';    // 100k gas
    this.isMonadTestnet = httpRpcUrl.includes('monad.xyz');
    
    if (this.isMonadTestnet) {
      logger.info('Monad Testnet detected, using compatible settings');
      // For Monad testnet, we'll use polling instead of WebSocket
      this.web3Ws = null;
      logger.info('WebSocket not supported for Monad testnet, using polling');
    } else {
      // For other networks, try WebSocket if available
      const wsRpcUrl = process.env.MONAD_WS_URL || httpRpcUrl.replace(/^http/, 'ws').replace(/^https/, 'wss');
      this.initializeWebSocketProvider(wsRpcUrl);
    }

    logger.info('MonadService initialized with URL:', { 
      httpUrl: httpRpcUrl,
      globalMcpEnabled: this.globalMcpEnabled
    });
    
    // Initialize contract
    try {
      if (!contractConfig.address) {
        throw new Error('CONTRACT_ADDRESS environment variable is not set');
      }
      
      this.contract = new this.web3.eth.Contract(contractConfig.abi, contractConfig.address);
      logger.info('Contract initialized:', { 
        address: contractConfig.address,
        network: this.isMonadTestnet ? 'Monad Testnet' : 'Other'
      });

      // Only try to connect to global MCP if enabled
      if (this.globalMcpEnabled && this.globalMcpUrl) {
        this.initializeGlobalMcp().catch(error => {
          logger.warn('Failed to initialize global MCP connection:', { 
            error: error.message,
            note: 'Continuing without global MCP connection'
          });
        });
      } else {
        logger.info('Global MCP connection disabled');
      }
    } catch (error) {
      logger.error('Failed to initialize contract:', { error: error.message });
      throw error;
    }
  }

  async initializeWebSocketProvider(wsRpcUrl) {
    const maxRetries = 3;
    let retryCount = 0;
    let connected = false;

    const tryConnect = async () => {
      try {
        if (this.web3Ws) {
          // Clean up existing provider
          const provider = this.web3Ws.currentProvider;
          if (provider && typeof provider.disconnect === 'function') {
            provider.disconnect();
          }
        }

        const provider = new Web3.providers.WebsocketProvider(wsRpcUrl, {
          timeout: 30000,
          clientConfig: {
            maxReceivedFrameSize: 100000000,
            maxReceivedMessageSize: 100000000,
            keepalive: true,
            keepaliveInterval: 60000
          },
          reconnect: {
            auto: true,
            delay: 5000,
            maxAttempts: 5,
            onTimeout: false
          }
        });

        // Set up provider event handlers
        provider.on('connect', () => {
          logger.info('WebSocket provider connected successfully');
          connected = true;
        });

        provider.on('error', (error) => {
          logger.error('WebSocket provider error:', { error: error.message });
          connected = false;
        });

        provider.on('close', () => {
          logger.warn('WebSocket provider connection closed');
          connected = false;
        });

        // Create new Web3 instance with WebSocket provider
        this.web3Ws = new Web3(provider);

        // Wait for connection
        await new Promise((resolve, reject) => {
          const timeout = setTimeout(() => {
            reject(new Error('Connection timeout'));
          }, 10000);

          provider.on('connect', () => {
            clearTimeout(timeout);
            resolve();
          });

          provider.on('error', (error) => {
            clearTimeout(timeout);
            reject(error);
          });
        });

        logger.info('WebSocket provider initialized successfully');
        return true;
      } catch (error) {
        logger.error('Failed to initialize WebSocket provider:', { 
          error: error.message,
          attempt: retryCount + 1,
          maxRetries
        });
        return false;
      }
    };

    while (!connected && retryCount < maxRetries) {
      connected = await tryConnect();
      if (!connected) {
        retryCount++;
        if (retryCount < maxRetries) {
          logger.info(`Retrying WebSocket connection (${retryCount}/${maxRetries})`);
          await new Promise(resolve => setTimeout(resolve, 5000));
        }
      }
    }

    if (!connected) {
      logger.warn('Failed to establish WebSocket connection after retries, falling back to HTTP only');
      this.web3Ws = null;
    }
  }

  async initializeGlobalMcp() {
    if (!this.globalMcpEnabled || !this.globalMcpUrl) {
      return;
    }

    try {
      this.globalMcpWs = new WebSocket(this.globalMcpUrl);
      
      this.globalMcpWs.on('open', () => {
        logger.info('Connected to global MCP server');
        // Register this server
        this.sendGlobalMcpMessage({
          type: 'register',
          data: {
            identifier: this.serverIdentifier,
            network: 'monad-testnet',
            capabilities: [
              'store_data',
              'get_data',
              'get_balance',
              'analyze_block',
              'account_tokens',
              'account_nfts',
              'account_activities'
            ]
          }
        });
      });

      this.globalMcpWs.on('message', async (data) => {
        try {
          const message = JSON.parse(data);
          await this.handleGlobalMcpMessage(message);
        } catch (error) {
          logger.error('Error handling global MCP message:', { 
            error: error.message,
            data: data.toString()
          });
        }
      });

      this.globalMcpWs.on('error', (error) => {
        logger.warn('Global MCP WebSocket error:', { 
          error: error.message,
          note: 'Continuing without global MCP connection'
        });
        this.globalMcpEnabled = false; // Disable to prevent further reconnection attempts
      });

      this.globalMcpWs.on('close', () => {
        if (this.globalMcpEnabled) {
          logger.info('Global MCP connection closed');
          this.globalMcpEnabled = false; // Disable to prevent further reconnection attempts
        }
      });
    } catch (error) {
      logger.warn('Failed to initialize global MCP connection:', { 
        error: error.message,
        note: 'Continuing without global MCP connection'
      });
      this.globalMcpEnabled = false; // Disable to prevent further reconnection attempts
    }
  }

  sendGlobalMcpMessage(message) {
    if (this.globalMcpEnabled && this.globalMcpWs?.readyState === WebSocket.OPEN) {
      this.globalMcpWs.send(JSON.stringify({
        ...message,
        timestamp: Date.now(),
        server: this.serverIdentifier
      }));
    }
  }

  async handleGlobalMcpMessage(message) {
    const { type, data, requestId } = message;
    
    try {
      let response;
      
      switch (type) {
        case 'store_data':
          response = await this.storeData(data.greeting, data.fromAddress);
          break;
          
        case 'get_data':
          response = await this.getData();
          break;
          
        case 'get_balance':
          response = await this.getBalance(data.address);
          break;
          
        case 'get_account_tokens':
          response = await this.getAccountTokens(data.address);
          break;
          
        case 'get_account_nfts':
          response = await this.getAccountNFTs(data.address, data.pageIndex);
          break;
          
        case 'get_account_activities':
          response = await this.getAccountActivities(data.address, data.limit);
          break;
          
        default:
          throw new Error(`Unsupported message type: ${type}`);
      }
      
      this.sendGlobalMcpMessage({
        type: 'response',
        requestId,
        data: response
      });
    } catch (error) {
      this.sendGlobalMcpMessage({
        type: 'error',
        requestId,
        error: {
          message: error.message,
          code: error.code
        }
      });
    }
  }

  async getBalance(address) {
    logger.info('Checking balance for address:', { address });
    try {
      const balance = await this.web3.eth.getBalance(address);
      const balanceInEth = this.web3.utils.fromWei(balance, 'ether');
      
      logger.info('Balance retrieved successfully:', { 
        address,
        balance: balance.toString(),
        balanceInEth
      });

      return {
        address,
        balance: balance.toString(),
        balanceInEth
      };
    } catch (error) {
      logger.error('Failed to get balance:', { 
        address,
        error: error.message
      });
      throw error;
    }
  }

  async storeData(greeting, fromAddress) {
    logger.info('Attempting to store greeting:', { greeting, fromAddress });
    try {
      // Validate gas settings
      if (!this.defaultGasPrice || !this.defaultGasLimit) {
        throw new Error('Gas settings are undefined');
      }

      // Timeout wrapper
      const timeout = new Promise((_, reject) => {
        setTimeout(() => reject(new Error('Transaction timed out')), 30000); // 30s timeout
      });

      const transaction = await Promise.race([
        this.contract.methods.setGreeting(greeting).send({
          from: fromAddress,
          gas: this.defaultGasLimit,
          gasPrice: this.defaultGasPrice
        }),
        timeout
      ]);

      const result = {
        transactionHash: transaction.transactionHash,
        blockNumber: BigInt(transaction.blockNumber).toString(),
        greeting
      };

      logger.info('Successfully stored greeting:', result);
      return result;
    } catch (error) {
      logger.error('Transaction failed:', {
        greeting,
        fromAddress,
        error: error.message,
        stack: error.stack
      });
      throw error;
    }
  }

  async executeWithRetry(operation, retries = this.maxRetries) {
    for (let attempt = 1; attempt <= retries; attempt++) {
      try {
        // Check if we need to wait before making the request
        const now = Date.now();
        const timeSinceLastRequest = now - this.lastRequestTime;
        if (timeSinceLastRequest < this.minRequestInterval) {
          await new Promise(resolve => setTimeout(resolve, this.minRequestInterval - timeSinceLastRequest));
        }

        this.lastRequestTime = Date.now();
        return await operation();
      } catch (error) {
        if (error.message.includes('request limit reached') && attempt < retries) {
          logger.warn(`Rate limit reached, retrying in ${this.retryDelay}ms (attempt ${attempt}/${retries})`);
          await new Promise(resolve => setTimeout(resolve, this.retryDelay * attempt));
          continue;
        }
        throw error;
      }
    }
  }

  async getLatestBlockNumber() {
    // Check cache first
    if (this.cache.latestBlock.value && 
        Date.now() - this.cache.latestBlock.timestamp < this.cache.latestBlock.ttl) {
      return this.cache.latestBlock.value.toString();
    }

    const result = await this.executeWithRetry(async () => {
      const blockNumber = await this.web3.eth.getBlockNumber();
      // Update cache
      this.cache.latestBlock = {
        value: blockNumber,
        timestamp: Date.now(),
        ttl: this.cache.latestBlock.ttl
      };
      return blockNumber.toString();
    });

    return result;
  }

  async getData() {
    // Check cache first
    if (this.cache.greeting.value && 
        Date.now() - this.cache.greeting.timestamp < this.cache.greeting.ttl) {
      return this.cache.greeting.value;
    }

    const result = await this.executeWithRetry(async () => {
      const greeting = await this.contract.methods.greeting().call();
      // Update cache
      this.cache.greeting = {
        value: greeting,
        timestamp: Date.now(),
        ttl: this.cache.greeting.ttl
      };
      return greeting;
    });

    return result;
  }

  async getAccountTokens(address) {
    logger.info('Fetching account tokens:', { address });
    try {
      const response = await axios.get(`${this.blockvisionBaseUrl}/account/tokens`, {
        params: { address },
        headers: {
          'accept': 'application/json',
          'x-api-key': this.blockvisionApiKey
        }
      });
      logger.info('Successfully fetched account tokens:', { address });
      return response.data;
    } catch (error) {
      logger.error('Failed to fetch account tokens:', {
        address,
        error: error.message,
        stack: error.stack
      });
      throw error;
    }
  }

  async getAccountNFTs(address, pageIndex = 1) {
    logger.info('Fetching account NFTs:', { address, pageIndex });
    try {
      const response = await axios.get(`${this.blockvisionBaseUrl}/account/nfts`, {
        params: { address, pageIndex },
        headers: {
          'accept': 'application/json',
          'x-api-key': this.blockvisionApiKey
        }
      });
      logger.info('Successfully fetched account NFTs:', { address, pageIndex });
      return response.data;
    } catch (error) {
      logger.error('Failed to fetch account NFTs:', {
        address,
        pageIndex,
        error: error.message,
        stack: error.stack
      });
      throw error;
    }
  }

  async getAccountActivities(address, limit = 20) {
    logger.info('Fetching account activities:', { address, limit });
    try {
      const response = await axios.get(`${this.blockvisionBaseUrl}/account/activities`, {
        params: { address, limit },
        headers: {
          'accept': 'application/json',
          'x-api-key': this.blockvisionApiKey
        }
      });
      logger.info('Successfully fetched account activities:', { address, limit });
      return response.data;
    } catch (error) {
      logger.error('Failed to fetch account activities:', {
        address,
        limit,
        error: error.message,
        stack: error.stack
      });
      throw error;
    }
  }

  async getAccountTransactions(address, limit = 20) {
    logger.info('Fetching account transactions:', { address, limit });
    try {
      const response = await axios.get(`${this.blockvisionBaseUrl}/account/transactions`, {
        params: { address, limit },
        headers: {
          'accept': 'application/json',
          'x-api-key': this.blockvisionApiKey
        }
      });
      logger.info('Successfully fetched account transactions:', { address, limit });
      return response.data;
    } catch (error) {
      logger.error('Failed to fetch account transactions:', {
        address,
        limit,
        error: error.message,
        stack: error.stack
      });
      throw error;
    }
  }

  async getAccountInternalTransactions(address, filter = 'all', limit = 20) {
    logger.info('Fetching account internal transactions:', { address, filter, limit });
    try {
      const response = await axios.get(`${this.blockvisionBaseUrl}/account/internal/transactions`, {
        params: { address, filter, limit },
        headers: {
          'accept': 'application/json',
          'x-api-key': this.blockvisionApiKey
        }
      });
      logger.info('Successfully fetched account internal transactions:', { address, filter, limit });
      return response.data;
    } catch (error) {
      logger.error('Failed to fetch account internal transactions:', {
        address,
        filter,
        limit,
        error: error.message,
        stack: error.stack
      });
      throw error;
    }
  }

  async getTokenActivities(address, tokenAddress, limit = 20) {
    logger.info('Fetching token activities:', { address, tokenAddress, limit });
    try {
      const response = await axios.get(`${this.blockvisionBaseUrl}/token/activities`, {
        params: { address, tokenAddress, limit },
        headers: {
          'accept': 'application/json',
          'x-api-key': this.blockvisionApiKey
        }
      });
      logger.info('Successfully fetched token activities:', { address, tokenAddress, limit });
      return response.data;
    } catch (error) {
      logger.error('Failed to fetch token activities:', {
        address,
        tokenAddress,
        limit,
        error: error.message,
        stack: error.stack
      });
      throw error;
    }
  }

  async getCollectionActivities(address, collectionAddress, limit = 20) {
    logger.info('Fetching collection activities:', { address, collectionAddress, limit });
    try {
      const response = await axios.get(`${this.blockvisionBaseUrl}/collection/activities`, {
        params: { address, collectionAddress, limit },
        headers: {
          'accept': 'application/json',
          'x-api-key': this.blockvisionApiKey
        }
      });
      logger.info('Successfully fetched collection activities:', { address, collectionAddress, limit });
      return response.data;
    } catch (error) {
      logger.error('Failed to fetch collection activities:', {
        address,
        collectionAddress,
        limit,
        error: error.message,
        stack: error.stack
      });
      throw error;
    }
  }

  async getTokenHolders(contractAddress, pageIndex = 1, pageSize = 20) {
    logger.info('Fetching token holders:', { contractAddress, pageIndex, pageSize });
    try {
      const response = await axios.get(`${this.blockvisionBaseUrl}/token/holders`, {
        params: { contractAddress, pageIndex, pageSize },
        headers: {
          'accept': 'application/json',
          'x-api-key': this.blockvisionApiKey
        }
      });
      logger.info('Successfully fetched token holders:', { contractAddress, pageIndex, pageSize });
      return response.data;
    } catch (error) {
      logger.error('Failed to fetch token holders:', {
        contractAddress,
        pageIndex,
        pageSize,
        error: error.message,
        stack: error.stack
      });
      throw error;
    }
  }

  async getNativeHolders(pageIndex = 1, pageSize = 20) {
    logger.info('Fetching native holders:', { pageIndex, pageSize });
    try {
      const response = await axios.get(`${this.blockvisionBaseUrl}/native/holders`, {
        params: { pageIndex, pageSize },
        headers: {
          'accept': 'application/json',
          'x-api-key': this.blockvisionApiKey
        }
      });
      logger.info('Successfully fetched native holders:', { pageIndex, pageSize });
      return response.data;
    } catch (error) {
      logger.error('Failed to fetch native holders:', {
        pageIndex,
        pageSize,
        error: error.message,
        stack: error.stack
      });
      throw error;
    }
  }

  async getCollectionHolders(contractAddress, pageIndex = 1, pageSize = 20) {
    logger.info('Fetching collection holders:', { contractAddress, pageIndex, pageSize });
    try {
      const response = await axios.get(`${this.blockvisionBaseUrl}/collection/holders`, {
        params: { contractAddress, pageIndex, pageSize },
        headers: {
          'accept': 'application/json',
          'x-api-key': this.blockvisionApiKey
        }
      });
      logger.info('Successfully fetched collection holders:', { contractAddress, pageIndex, pageSize });
      return response.data;
    } catch (error) {
      logger.error('Failed to fetch collection holders:', {
        contractAddress,
        pageIndex,
        pageSize,
        error: error.message,
        stack: error.stack
      });
      throw error;
    }
  }

  async getContractSourceCode(address) {
    logger.info('Fetching contract source code:', { address });
    try {
      const response = await axios.get(`${this.blockvisionBaseUrl}/contract/source/code`, {
        params: { address },
        headers: {
          'accept': 'application/json',
          'x-api-key': this.blockvisionApiKey
        }
      });
      logger.info('Successfully fetched contract source code:', { address });
      return response.data;
    } catch (error) {
      logger.error('Failed to fetch contract source code:', {
        address,
        error: error.message,
        stack: error.stack
      });
      throw error;
    }
  }

  async getTokenGating(account, contractAddress) {
    logger.info('Fetching token gating:', { account, contractAddress });
    try {
      const response = await axios.get(`${this.blockvisionBaseUrl}/token/gating`, {
        params: { account, contractAddress },
        headers: {
          'accept': 'application/json',
          'x-api-key': this.blockvisionApiKey
        }
      });
      logger.info('Successfully fetched token gating:', { account, contractAddress });
      return response.data;
    } catch (error) {
      logger.error('Failed to fetch token gating:', {
        account,
        contractAddress,
        error: error.message,
        stack: error.stack
      });
      throw error;
    }
  }

  async analyzeBlock(blockNumber) {
    try {
      logger.info('Analyzing block:', { blockNumber });
      
      // Get block with transactions
      const block = await this.web3.eth.getBlock(blockNumber, true);
      if (!block) {
        throw new Error('Block not found');
      }

      // Process transactions
      const transactions = await Promise.all(block.transactions.map(async (tx) => {
        const receipt = await this.web3.eth.getTransactionReceipt(tx.hash);
        return {
          hash: tx.hash,
          from: tx.from,
          to: tx.to,
          value: tx.value.toString(),
          gasUsed: receipt.gasUsed.toString()
        };
      }));

      return {
        blockNumber: block.number.toString(),
        timestamp: block.timestamp.toString(),
        transactionCount: block.transactions.length,
        totalGasUsed: block.gasUsed.toString(),
        transactions
      };
    } catch (error) {
      logger.error('Failed to analyze block:', { 
        blockNumber,
        error: error.message
      });
      throw error;
    }
  }

  close() {
    logger.info('Closing MonadService');
    if (this.globalMcpWs) {
      this.globalMcpWs.close();
    }
  }
}

export default new MonadService();