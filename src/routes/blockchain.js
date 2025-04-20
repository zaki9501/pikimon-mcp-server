import express from 'express';
import monadService from '../services/monad.js';
import logger from '../utils/logger.js';
import { ethers } from 'ethers';

const router = express.Router();

/**
 * @swagger
 * /api/blockchain/latest-block:
 *   get:
 *     summary: Get the latest block number
 *     tags: [Blockchain]
 *     responses:
 *       200:
 *         description: Latest block number retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 data:
 *                   type: object
 *                   properties:
 *                     blockNumber:
 *                       type: string
 *       500:
 *         description: Server error
 */
router.get('/blockchain/latest-block', async (req, res) => {
  try {
    logger.info('Fetching latest block number');
    const blockNumber = await monadService.getLatestBlockNumber();
    res.json({ 
      success: true,
      data: { blockNumber }
    });
  } catch (error) {
    logger.error('Failed to fetch latest block number:', { error: error.message });
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * @swagger
 * /api/blockchain/analyze-block/{blockNumber}:
 *   get:
 *     summary: Get detailed analysis of a specific block
 *     tags: [Blockchain]
 *     parameters:
 *       - in: path
 *         name: blockNumber
 *         required: true
 *         schema:
 *           type: string
 *         description: The block number to analyze
 *     responses:
 *       200:
 *         description: Block analysis retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 data:
 *                   type: object
 *                   properties:
 *                     blockNumber:
 *                       type: string
 *                     timestamp:
 *                       type: string
 *                     transactionCount:
 *                       type: integer
 *                     totalGasUsed:
 *                       type: string
 *                     transactions:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           hash:
 *                             type: string
 *                           from:
 *                             type: string
 *                           to:
 *                             type: string
 *                           value:
 *                             type: string
 *                           gasUsed:
 *                             type: string
 *       400:
 *         description: Invalid block number
 *       404:
 *         description: Block not found
 *       500:
 *         description: Server error
 */
router.get('/blockchain/analyze-block/:blockNumber', async (req, res) => {
  try {
    const blockNumber = req.params.blockNumber;
    logger.info('Analyzing block:', { blockNumber });

    if (isNaN(blockNumber) || blockNumber < 0) {
      logger.warn('Invalid block number requested:', { blockNumber });
      return res.status(400).json({
        success: false,
        error: 'Invalid block number'
      });
    }

    const blockAnalysis = await monadService.analyzeBlock(blockNumber);
    res.json({
      success: true,
      data: blockAnalysis
    });
  } catch (error) {
    if (error.message === 'Block not found') {
      logger.warn('Block not found:', { blockNumber: req.params.blockNumber });
      res.status(404).json({
        success: false,
        error: 'Block not found'
      });
    } else {
      logger.error('Failed to analyze block:', { 
        blockNumber: req.params.blockNumber,
        error: error.message
      });
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  }
});

/**
 * @swagger
 * /api/blockchain/balance/{address}:
 *   get:
 *     summary: Get balance for a specific address
 *     tags: [Blockchain]
 *     parameters:
 *       - in: path
 *         name: address
 *         required: true
 *         schema:
 *           type: string
 *         description: The Ethereum address to check balance for
 *     responses:
 *       200:
 *         description: Balance retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 data:
 *                   type: object
 *                   properties:
 *                     address:
 *                       type: string
 *                     balance:
 *                       type: string
 *                     balanceInEth:
 *                       type: string
 *       400:
 *         description: Invalid address
 *       500:
 *         description: Server error
 */
router.get('/blockchain/balance/:address', async (req, res) => {
  try {
    const { address } = req.params;
    logger.info('Fetching balance for address:', { address });

    if (!ethers.isAddress(address)) {
      logger.warn('Invalid address format:', { address });
      return res.status(400).json({
        success: false,
        error: 'Invalid address format'
      });
    }

    const balanceData = await monadService.getBalance(address);
    res.json({
      success: true,
      data: {
        address: balanceData.address,
        balance: balanceData.balance,
        balanceInEth: balanceData.balanceInEth
      }
    });
  } catch (error) {
    logger.error('Failed to fetch balance:', { 
      address: req.params.address,
      error: error.message
    });
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * @swagger
 * /api/store-data:
 *   post:
 *     summary: Store a greeting value in the smart contract
 *     tags: [API]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - value
 *             properties:
 *               value:
 *                 type: string
 *                 description: The greeting value to store
 *     responses:
 *       200:
 *         description: Value stored successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 data:
 *                   type: object
 *                   properties:
 *                     transactionHash:
 *                       type: string
 *                     blockNumber:
 *                       type: string
 *                     value:
 *                       type: string
 *       400:
 *         description: Invalid input parameters
 *       500:
 *         description: Server error
 */
router.post('/store-data', async (req, res) => {
  try {
    const { value } = req.body;

    if (value === undefined) {
      logger.warn('Invalid request parameters:', { value });
      return res.status(400).json({
        success: false,
        error: 'Missing required parameter: value'
      });
    }

    const wallet = new ethers.Wallet(process.env.PRIVATE_KEY);
    const fromAddress = wallet.address;

    logger.info('Storing data with address:', { fromAddress });
    const result = await monadService.storeData(value, fromAddress);
    res.json({
      success: true,
      data: result
    });
  } catch (error) {
    logger.error('Failed to store data:', { error: error.message });
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * @swagger
 * /api/get-data:
 *   get:
 *     summary: Get the stored greeting value
 *     tags: [API]
 *     responses:
 *       200:
 *         description: Greeting value retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 data:
 *                   type: object
 *                   properties:
 *                     value:
 *                       type: string
 *       500:
 *         description: Server error
 */
router.get('/get-data', async (req, res) => {
  try {
    logger.info('Attempting to retrieve greeting from contract');
    const value = await monadService.getData();
    res.json({ 
      success: true,
      data: { value }
    });
  } catch (error) {
    logger.error('Failed to get data:', { error: error.message });
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * @swagger
 * /api/account/tokens/{address}:
 *   get:
 *     summary: Retrieve tokens held by an account
 *     tags: [BlockVision]
 *     parameters:
 *       - in: path
 *         name: address
 *         required: true
 *         schema:
 *           type: string
 *         description: The account address
 *     responses:
 *       200:
 *         description: Account tokens retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *       400:
 *         description: Invalid address
 *       500:
 *         description: Server error
 */
router.get('/account/tokens/:address', async (req, res) => {
  const { address } = req.params;
  try {
    if (!ethers.isAddress(address)) {
      logger.warn('Invalid address:', { address });
      return res.status(400).json({ success: false, error: 'Invalid address' });
    }
    const data = await monadService.getAccountTokens(address);
    res.json({ success: true, data });
  } catch (error) {
    logger.error('Error in account tokens endpoint:', { address, error: error.message });
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * @swagger
 * /api/account/nfts/{address}:
 *   get:
 *     summary: Retrieve NFTs held by an account
 *     tags: [BlockVision]
 *     parameters:
 *       - in: path
 *         name: address
 *         required: true
 *         schema:
 *           type: string
 *         description: The account address
 *       - in: query
 *         name: pageIndex
 *         schema:
 *           type: integer
 *           default: 1
 *         description: Page index for pagination
 *     responses:
 *       200:
 *         description: Account NFTs retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *       400:
 *         description: Invalid address or pageIndex
 *       500:
 *         description: Server error
 */
router.get('/account/nfts/:address', async (req, res) => {
  const { address } = req.params;
  const { pageIndex } = req.query;
  try {
    if (!ethers.isAddress(address)) {
      logger.warn('Invalid address:', { address });
      return res.status(400).json({ success: false, error: 'Invalid address' });
    }
    const data = await monadService.getAccountNFTs(address, parseInt(pageIndex) || 1);
    res.json({ success: true, data });
  } catch (error) {
    logger.error('Error in account NFTs endpoint:', { address, pageIndex, error: error.message });
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * @swagger
 * /api/account/activities/{address}:
 *   get:
 *     summary: Retrieve account activities
 *     tags: [BlockVision]
 *     parameters:
 *       - in: path
 *         name: address
 *         required: true
 *         schema:
 *           type: string
 *         description: The account address
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 20
 *         description: Number of activities to retrieve
 *     responses:
 *       200:
 *         description: Account activities retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *       400:
 *         description: Invalid address or limit
 *       500:
 *         description: Server error
 */
router.get('/account/activities/:address', async (req, res) => {
  const { address } = req.params;
  const { limit } = req.query;
  try {
    if (!ethers.isAddress(address)) {
      logger.warn('Invalid address:', { address });
      return res.status(400).json({ success: false, error: 'Invalid address' });
    }
    const data = await monadService.getAccountActivities(address, parseInt(limit) || 20);
    res.json({ success: true, data });
  } catch (error) {
    logger.error('Error in account activities endpoint:', { address, limit, error: error.message });
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * @swagger
 * /api/account/transactions/{address}:
 *   get:
 *     summary: Retrieve account transactions
 *     tags: [BlockVision]
 *     parameters:
 *       - in: path
 *         name: address
 *         required: true
 *         schema:
 *           type: string
 *         description: The account address
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 20
 *         description: Number of transactions to retrieve
 *     responses:
 *       200:
 *         description: Account transactions retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *       400:
 *         description: Invalid address or limit
 *       500:
 *         description: Server error
 */
router.get('/account/transactions/:address', async (req, res) => {
  const { address } = req.params;
  const { limit } = req.query;
  try {
    if (!ethers.isAddress(address)) {
      logger.warn('Invalid address:', { address });
      return res.status(400).json({ success: false, error: 'Invalid address' });
    }
    const data = await monadService.getAccountTransactions(address, parseInt(limit) || 20);
    res.json({ success: true, data });
  } catch (error) {
    logger.error('Error in account transactions endpoint:', { address, limit, error: error.message });
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * @swagger
 * /api/account/internal/transactions/{address}:
 *   get:
 *     summary: Retrieve account internal transactions
 *     tags: [BlockVision]
 *     parameters:
 *       - in: path
 *         name: address
 *         required: true
 *         schema:
 *           type: string
 *         description: The account address
 *       - in: query
 *         name: filter
 *         schema:
 *           type: string
 *           default: all
 *         description: Filter type (e.g., all)
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 20
 *         description: Number of internal transactions to retrieve
 *     responses:
 *       200:
 *         description: Account internal transactions retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *       400:
 *         description: Invalid address, filter, or limit
 *       500:
 *         description: Server error
 */
router.get('/account/internal/transactions/:address', async (req, res) => {
  const { address } = req.params;
  const { filter, limit } = req.query;
  try {
    if (!ethers.isAddress(address)) {
      logger.warn('Invalid address:', { address });
      return res.status(400).json({ success: false, error: 'Invalid address' });
    }
    const data = await monadService.getAccountInternalTransactions(address, filter || 'all', parseInt(limit) || 20);
    res.json({ success: true, data });
  } catch (error) {
    logger.error('Error in account internal transactions endpoint:', { address, filter, limit, error: error.message });
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * @swagger
 * /api/token/activities/{address}/{tokenAddress}:
 *   get:
 *     summary: Retrieve token activities for an account
 *     tags: [BlockVision]
 *     parameters:
 *       - in: path
 *         name: address
 *         required: true
 *         schema:
 *           type: string
 *         description: The account address
 *       - in: path
 *         name: tokenAddress
 *         required: true
 *         schema:
 *           type: string
 *         description: The token contract address
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 20
 *         description: Number of activities to retrieve
 *     responses:
 *       200:
 *         description: Token activities retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *       400:
 *         description: Invalid address or tokenAddress
 *       500:
 *         description: Server error
 */
router.get('/token/activities/:address/:tokenAddress', async (req, res) => {
  const { address, tokenAddress } = req.params;
  const { limit } = req.query;
  try {
    if (!ethers.isAddress(address) || !ethers.isAddress(tokenAddress)) {
      logger.warn('Invalid address or tokenAddress:', { address, tokenAddress });
      return res.status(400).json({ success: false, error: 'Invalid address or tokenAddress' });
    }
    const data = await monadService.getTokenActivities(address, tokenAddress, parseInt(limit) || 20);
    res.json({ success: true, data });
  } catch (error) {
    logger.error('Error in token activities endpoint:', { address, tokenAddress, limit, error: error.message });
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * @swagger
 * /api/collection/activities/{address}/{collectionAddress}:
 *   get:
 *     summary: Retrieve collection activities for an account
 *     tags: [BlockVision]
 *     parameters:
 *       - in: path
 *         name: address
 *         required: true
 *         schema:
 *           type: string
 *         description: The account address
 *       - in: path
 *         name: collectionAddress
 *         required: true
 *         schema:
 *           type: string
 *         description: The collection contract address
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 20
 *         description: Number of activities to retrieve
 *     responses:
 *       200:
 *         description: Collection activities retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *       400:
 *         description: Invalid address or collectionAddress
 *       500:
 *         description: Server error
 */
router.get('/collection/activities/:address/:collectionAddress', async (req, res) => {
  const { address, collectionAddress } = req.params;
  const { limit } = req.query;
  try {
    if (!ethers.isAddress(address) || !ethers.isAddress(collectionAddress)) {
      logger.warn('Invalid address or collectionAddress:', { address, collectionAddress });
      return res.status(400).json({ success: false, error: 'Invalid address or collectionAddress' });
    }
    const data = await monadService.getCollectionActivities(address, collectionAddress, parseInt(limit) || 20);
    res.json({ success: true, data });
  } catch (error) {
    logger.error('Error in collection activities endpoint:', { address, collectionAddress, limit, error: error.message });
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * @swagger
 * /api/token/holders/{contractAddress}:
 *   get:
 *     summary: Retrieve token holders
 *     tags: [BlockVision]
 *     parameters:
 *       - in: path
 *         name: contractAddress
 *         required: true
 *         schema:
 *           type: string
 *         description: The token contract address
 *       - in: query
 *         name: pageIndex
 *         schema:
 *           type: integer
 *           default: 1
 *         description: Page index for pagination
 *       - in: query
 *         name: pageSize
 *         schema:
 *           type: integer
 *           default: 20
 *         description: Number of holders per page
 *     responses:
 *       200:
 *         description: Token holders retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *       400:
 *         description: Invalid contractAddress
 *       500:
 *         description: Server error
 */
router.get('/token/holders/:contractAddress', async (req, res) => {
  const { contractAddress } = req.params;
  const { pageIndex, pageSize } = req.query;
  try {
    if (!ethers.isAddress(contractAddress)) {
      logger.warn('Invalid contractAddress:', { contractAddress });
      return res.status(400).json({ success: false, error: 'Invalid contractAddress' });
    }
    const data = await monadService.getTokenHolders(contractAddress, parseInt(pageIndex) || 1, parseInt(pageSize) || 20);
    res.json({ success: true, data });
  } catch (error) {
    logger.error('Error in token holders endpoint:', { contractAddress, pageIndex, pageSize, error: error.message });
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * @swagger
 * /api/native/holders:
 *   get:
 *     summary: Retrieve native token holders
 *     tags: [BlockVision]
 *     parameters:
 *       - in: query
 *         name: pageIndex
 *         schema:
 *           type: integer
 *           default: 1
 *         description: Page index for pagination
 *       - in: query
 *         name: pageSize
 *         schema:
 *           type: integer
 *           default: 20
 *         description: Number of holders per page
 *     responses:
 *       200:
 *         description: Native token holders retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *       400:
 *         description: Invalid pageIndex or pageSize
 *       500:
 *         description: Server error
 */
router.get('/native/holders', async (req, res) => {
  const { pageIndex, pageSize } = req.query;
  try {
    const data = await monadService.getNativeHolders(parseInt(pageIndex) || 1, parseInt(pageSize) || 20);
    res.json({ success: true, data });
  } catch (error) {
    logger.error('Error in native holders endpoint:', { pageIndex, pageSize, error: error.message });
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * @swagger
 * /api/collection/holders/{contractAddress}:
 *   get:
 *     summary: Retrieve collection holders
 *     tags: [BlockVision]
 *     parameters:
 *       - in: path
 *         name: contractAddress
 *         required: true
 *         schema:
 *           type: string
 *         description: The collection contract address
 *       - in: query
 *         name: pageIndex
 *         schema:
 *           type: integer
 *           default: 1
 *         description: Page index for pagination
 *       - in: query
 *         name: pageSize
 *         schema:
 *           type: integer
 *           default: 20
 *         description: Number of holders per page
 *     responses:
 *       200:
 *         description: Collection holders retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *       400:
 *         description: Invalid contractAddress
 *       500:
 *         description: Server error
 */
router.get('/collection/holders/:contractAddress', async (req, res) => {
  const { contractAddress } = req.params;
  const { pageIndex, pageSize } = req.query;
  try {
    if (!ethers.isAddress(contractAddress)) {
      logger.warn('Invalid contractAddress:', { contractAddress });
      return res.status(400).json({ success: false, error: 'Invalid contractAddress' });
    }
    const data = await monadService.getCollectionHolders(contractAddress, parseInt(pageIndex) || 1, parseInt(pageSize) || 20);
    res.json({ success: true, data });
  } catch (error) {
    logger.error('Error in collection holders endpoint:', { contractAddress, pageIndex, pageSize, error: error.message });
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * @swagger
 * /api/contract/source/code/{address}:
 *   get:
 *     summary: Retrieve contract source code
 *     tags: [BlockVision]
 *     parameters:
 *       - in: path
 *         name: address
 *         required: true
 *         schema:
 *           type: string
 *         description: The contract address
 *     responses:
 *       200:
 *         description: Contract source code retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *       400:
 *         description: Invalid address
 *       500:
 *         description: Server error
 */
router.get('/contract/source/code/:address', async (req, res) => {
  const { address } = req.params;
  try {
    if (!ethers.isAddress(address)) {
      logger.warn('Invalid address:', { address });
      return res.status(400).json({ success: false, error: 'Invalid address' });
    }
    const data = await monadService.getContractSourceCode(address);
    res.json({ success: true, data });
  } catch (error) {
    logger.error('Error in contract source code endpoint:', { address, error: error.message });
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * @swagger
 * /api/token/gating/{account}/{contractAddress}:
 *   get:
 *     summary: Retrieve token gating information
 *     tags: [BlockVision]
 *     parameters:
 *       - in: path
 *         name: account
 *         required: true
 *         schema:
 *           type: string
 *         description: The account address
 *       - in: path
 *         name: contractAddress
 *         required: true
 *         schema:
 *           type: string
 *         description: The contract address
 *     responses:
 *       200:
 *         description: Token gating information retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *       400:
 *         description: Invalid account or contractAddress
 *       500:
 *         description: Server error
 */
router.get('/token/gating/:account/:contractAddress', async (req, res) => {
  const { account, contractAddress } = req.params;
  try {
    if (!ethers.isAddress(account) || !ethers.isAddress(contractAddress)) {
      logger.warn('Invalid account or contractAddress:', { account, contractAddress });
      return res.status(400).json({ success: false, error: 'Invalid account or contractAddress' });
    }
    const data = await monadService.getTokenGating(account, contractAddress);
    res.json({ success: true, data });
  } catch (error) {
    logger.error('Error in token gating endpoint:', { account, contractAddress, error: error.message });
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * @swagger
 * /api/chat:
 *   post:
 *     summary: Conversational query interface for BlockVision APIs
 *     tags: [Chat]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - message
 *             properties:
 *               message:
 *                 type: string
 *                 description: The conversational query (e.g., "Check the balance of 0x...")
 *     responses:
 *       200:
 *         description: Response to the query in human-readable format
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 reply:
 *                   type: string
 *                   description: Human-readable response
 *       400:
 *         description: Invalid or unclear query
 *       500:
 *         description: Server error
 */
router.post('/chat', async (req, res) => {
  try {
    const { message } = req.body;
    if (!message || typeof message !== 'string') {
      logger.warn('Invalid chat message:', { message });
      return res.status(400).json({ success: false, reply: 'Please send a valid message.' });
    }

    logger.info('Processing chat message:', { message });
    const messageLower = message.toLowerCase();

    // Extract address using regex (matches 0x followed by 40 hex chars)
    const addressMatch = message.match(/0x[a-fA-F0-9]{40}/);
    const address = addressMatch ? addressMatch[0] : null;

    // Extract contract address for APIs requiring it
    const contractAddressMatch = message.match(/(?:contract|token|collection)\s+(0x[a-fA-F0-9]{40})/i);
    const contractAddress = contractAddressMatch ? contractAddressMatch[1] : null;

    // Helper to format token balance
    const formatBalance = (balance, decimals = 18) => {
      const num = parseFloat(ethers.formatUnits(balance, decimals));
      return num >= 1 ? num.toFixed(2) : num.toFixed(6);
    };

    // Handle different intents based on keywords
    if (messageLower.includes('balance') || messageLower.includes('tokens')) {
      if (!address || !ethers.isAddress(address)) {
        return res.status(400).json({ success: false, reply: 'I need a valid address to check the balance. Try something like "Check the balance of 0x...".' });
      }
      const data = await monadService.getAccountTokens(address);
      const tokens = data.result?.tokens || [];
      if (tokens.length === 0) {
        return res.json({ success: true, reply: `Looks like ${address} doesn't hold any tokens right now.` });
      }
      let reply = `Here's what ${address} is holding:\n`;
      tokens.forEach(token => {
        const balance = formatBalance(token.balance, token.decimals);
        reply += `- ${balance} ${token.symbol} (${token.name})\n`;
      });
      return res.json({ success: true, reply });

    } else if (messageLower.includes('nfts')) {
      if (!address || !ethers.isAddress(address)) {
        return res.status(400).json({ success: false, reply: 'Please give me a valid address to check NFTs.' });
      }
      const data = await monadService.getAccountNFTs(address, 1);
      const nfts = data.result?.nfts || [];
      if (nfts.length === 0) {
        return res.json({ success: true, reply: `${address} doesn't seem to own any NFTs at the moment.` });
      }
      let reply = `${address} has some cool NFTs:\n`;
      nfts.slice(0, 5).forEach(nft => {
        reply += `- ${nft.name || 'Unnamed NFT'} (Token ID: ${nft.tokenId})\n`;
      });
      if (nfts.length > 5) {
        reply += `...and ${nfts.length - 5} more! Want me to fetch more details?`;
      }
      return res.json({ success: true, reply });

    } else if (messageLower.includes('activities')) {
      if (!address || !ethers.isAddress(address)) {
        return res.status(400).json({ success: false, reply: 'I need a valid address to check activities.' });
      }
      const data = await monadService.getAccountActivities(address, 5);
      const activities = data.result?.activities || [];
      if (activities.length === 0) {
        return res.json({ success: true, reply: `No recent activities found for ${address}.` });
      }
      let reply = `Recent activities for ${address}:\n`;
      activities.forEach(activity => {
        reply += `- ${activity.type} on block ${activity.blockNumber} (Hash: ${activity.transactionHash.slice(0, 10)}...)\n`;
      });
      return res.json({ success: true, reply });

    } else if (messageLower.includes('transactions')) {
      if (!address || !ethers.isAddress(address)) {
        return res.status(400).json({ success: false, reply: 'Please provide a valid address to see transactions.' });
      }
      const data = await monadService.getAccountTransactions(address, 5);
      const transactions = data.result?.transactions || [];
      if (transactions.length === 0) {
        return res.json({ success: true, reply: `${address} hasn't made any transactions recently.` });
      }
      let reply = `Here are some recent transactions for ${address}:\n`;
      transactions.forEach(tx => {
        const value = formatBalance(tx.value);
        reply += `- Sent ${value} MON to ${tx.to.slice(0, 10)}... (Hash: ${tx.hash.slice(0, 10)}...)\n`;
      });
      return res.json({ success: true, reply });

    } else if (messageLower.includes('internal transactions')) {
      if (!address || !ethers.isAddress(address)) {
        return res.status(400).json({ success: false, reply: 'I need a valid address for internal transactions.' });
      }
      const data = await monadService.getAccountInternalTransactions(address, 'all', 5);
      const transactions = data.result?.transactions || [];
      if (transactions.length === 0) {
        return res.json({ success: true, reply: `No internal transactions found for ${address}.` });
      }
      let reply = `Internal transactions for ${address}:\n`;
      transactions.forEach(tx => {
        const value = formatBalance(tx.value);
        reply += `- ${tx.type} of ${value} MON (Hash: ${tx.hash.slice(0, 10)}...)\n`;
      });
      return res.json({ success: true, reply });

    } else if (messageLower.includes('token activities')) {
      if (!address || !ethers.isAddress(address) || !contractAddress || !ethers.isAddress(contractAddress)) {
        return res.status(400).json({ success: false, reply: 'Please provide both an account address and a token contract address.' });
      }
      const data = await monadService.getTokenActivities(address, contractAddress, 5);
      const activities = data.result?.activities || [];
      if (activities.length === 0) {
        return res.json({ success: true, reply: `No activities found for token ${contractAddress} at ${address}.` });
      }
      let reply = `Token activities for ${address} with ${contractAddress}:\n`;
      activities.forEach(activity => {
        reply += `- ${activity.type} on block ${activity.blockNumber} (Hash: ${activity.transactionHash.slice(0, 10)}...)\n`;
      });
      return res.json({ success: true, reply });

    } else if (messageLower.includes('collection activities')) {
      if (!address || !ethers.isAddress(address) || !contractAddress || !ethers.isAddress(contractAddress)) {
        return res.status(400).json({ success: false, reply: 'Please provide both an account address and a collection contract address.' });
      }
      const data = await monadService.getCollectionActivities(address, contractAddress, 5);
      const activities = data.result?.activities || [];
      if (activities.length === 0) {
        return res.json({ success: true, reply: `No collection activities found for ${address} with ${contractAddress}.` });
      }
      let reply = `Collection activities for ${address} with ${contractAddress}:\n`;
      activities.forEach(activity => {
        reply += `- ${activity.type} (Token ID: ${activity.tokenId || 'N/A'}) on block ${activity.blockNumber}\n`;
      });
      return res.json({ success: true, reply });

    } else if (messageLower.includes('token holders')) {
      if (!contractAddress || !ethers.isAddress(contractAddress)) {
        return res.status(400).json({ success: false, reply: 'Please provide a valid token contract address.' });
      }
      const data = await monadService.getTokenHolders(contractAddress, 1, 5);
      const holders = data.result?.holders || [];
      if (holders.length === 0) {
        return res.json({ success: true, reply: `No holders found for token ${contractAddress}.` });
      }
      let reply = `Top holders for token ${contractAddress}:\n`;
      holders.forEach(holder => {
        const balance = formatBalance(holder.balance, holder.decimals);
        reply += `- ${holder.address.slice(0, 10)}... holds ${balance} tokens\n`;
      });
      return res.json({ success: true, reply });

    } else if (messageLower.includes('native holders') || messageLower.includes('mon holders')) {
      const data = await monadService.getNativeHolders(1, 5);
      const holders = data.result?.holders || [];
      if (holders.length === 0) {
        return res.json({ success: true, reply: 'No native MON holders found.' });
      }
      let reply = `Top holders of MON tokens:\n`;
      holders.forEach(holder => {
        const balance = formatBalance(holder.balance);
        reply += `- ${holder.address.slice(0, 10)}... holds ${balance} MON\n`;
      });
      return res.json({ success: true, reply });

    } else if (messageLower.includes('collection holders')) {
      if (!contractAddress || !ethers.isAddress(contractAddress)) {
        return res.status(400).json({ success: false, reply: 'Please provide a valid collection contract address.' });
      }
      const data = await monadService.getCollectionHolders(contractAddress, 1, 5);
      const holders = data.result?.holders || [];
      if (holders.length === 0) {
        return res.json({ success: true, reply: `No holders found for collection ${contractAddress}.` });
      }
      let reply = `Top holders for collection ${contractAddress}:\n`;
      holders.forEach(holder => {
        reply += `- ${holder.address.slice(0, 10)}... owns ${holder.tokenCount} NFTs\n`;
      });
      return res.json({ success: true, reply });

    } else if (messageLower.includes('contract source') || messageLower.includes('source code')) {
      if (!contractAddress || !ethers.isAddress(contractAddress)) {
        return res.status(400).json({ success: false, reply: 'Please provide a valid contract address.' });
      }
      const data = await monadService.getContractSourceCode(contractAddress);
      const source = data.result?.sourceCode || 'No source code available';
      const contractName = data.result?.contractName || 'Unknown contract';
      return res.json({ 
        success: true, 
        reply: `The source code for ${contractAddress} (${contractName}) is:\n${source.slice(0, 200)}... (shortened for brevity)` 
      });

    } else if (messageLower.includes('token gating')) {
      if (!address || !ethers.isAddress(address) || !contractAddress || !ethers.isAddress(contractAddress)) {
        return res.status(400).json({ success: false, reply: 'Please provide both an account address and a contract address.' });
      }
      const data = await monadService.getTokenGating(address, contractAddress);
      const isGated = data.result?.isGated || false;
      return res.json({ 
        success: true, 
        reply: isGated 
          ? `${address} has access to gated content for ${contractAddress}!` 
          : `${address} doesn't have access to gated content for ${contractAddress}.`
      });

    } else {
      return res.status(400).json({ 
        success: false, 
        reply: "I didn't quite understand that. Try something like 'Check the balance of 0x...' or 'What NFTs does 0x... own?'" 
      });
    }
  } catch (error) {
    logger.error('Error in chat endpoint:', { message, error: error.message });
    res.status(500).json({ success: false, reply: `Oops, something went wrong: ${error.message}` });
  }
});

export default router;