import express from 'express';
import chainService from '../services/chain.js';
import logger from '../utils/logger.js';
import { ethers } from 'ethers';

const router = express.Router();

/**
 * @swagger
 * /api/execute-chain:
 *   post:
 *     summary: Execute a chain of operations (store, retrieve, and analyze)
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
 *                 description: The greeting value to store and analyze
 *     responses:
 *       200:
 *         description: Chain execution completed successfully
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
 *                     stored:
 *                       type: object
 *                       properties:
 *                         value:
 *                           type: string
 *                         transactionHash:
 *                           type: string
 *                         blockNumber:
 *                           type: string
 *                     retrieved:
 *                       type: object
 *                       properties:
 *                         value:
 *                           type: string
 *                     gasAnalysis:
 *                       type: object
 *                       properties:
 *                         blockGasUsed:
 *                           type: string
 *                         transactionGasUsed:
 *                           type: string
 *       400:
 *         description: Invalid input parameters
 *       500:
 *         description: Server error
 */
router.post('/execute-chain', async (req, res, next) => {
  try {
    const { value } = req.body;

    // Validate input
    if (value === undefined) {
      logger.warn('Invalid request parameters:', { value });
      return res.status(400).json({
        success: false,
        error: 'Missing required parameter: value'
      });
    }

    // Derive address from private key
    const wallet = new ethers.Wallet(process.env.PRIVATE_KEY);
    const fromAddress = wallet.address;

    logger.info('Executing chain with address:', { fromAddress });
    
    // Execute the chain
    const result = await chainService.executeChain(value, fromAddress);
    
    res.json({
      success: true,
      data: result
    });

  } catch (error) {
    logger.error('Chain execution request failed:', { error: error.message });
    next(error);
  }
});

/**
 * @swagger
 * /actions/parallel-block-analysis:
 *   get:
 *     summary: Analyze the last three blocks in parallel
 *     tags: [Actions]
 *     responses:
 *       200:
 *         description: Parallel block analysis completed successfully
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
 *                     analyzedBlocks:
 *                       type: integer
 *                       description: Number of blocks successfully analyzed
 *                     blocks:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           blockNumber:
 *                             type: string
 *                           timestamp:
 *                             type: string
 *                           transactionCount:
 *                             type: integer
 *                           totalGasUsed:
 *                             type: string
 *       500:
 *         description: Server error
 */
router.get('/parallel-block-analysis', async (req, res, next) => {
  try {
    logger.info('Starting parallel block analysis request');
    
    const results = await chainService.parallelBlockAnalysis();
    
    res.json({
      success: true,
      data: {
        analyzedBlocks: results.length,
        blocks: results
      }
    });

  } catch (error) {
    logger.error('Parallel block analysis request failed:', { error: error.message });
    next(error);
  }
});

export default router; 