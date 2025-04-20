import monadService from './monad.js';
import logger from '../utils/logger.js';

class ChainService {
  async executeChain(value, fromAddress) {
    try {
      logger.info('Starting execution chain:', { value, fromAddress });

      // 1. Store value in contract
      logger.info('Step 1: Storing value in contract');
      const storeResult = await monadService.storeData(value, fromAddress);
      
      // 2. Retrieve the value
      logger.info('Step 2: Retrieving stored value');
      const retrievedValue = await monadService.getData();
      
      // 3. Analyze the transaction block
      logger.info('Step 3: Analyzing transaction block');
      const blockAnalysis = await monadService.analyzeBlock(storeResult.blockNumber);
      
      // Find our transaction in the block
      const ourTransaction = blockAnalysis.transactions.find(
        tx => tx.hash === storeResult.transactionHash
      );

      const result = {
        stored: {
          value,
          transactionHash: storeResult.transactionHash,
          blockNumber: storeResult.blockNumber.toString()
        },
        retrieved: {
          value: retrievedValue
        },
        gasAnalysis: {
          blockGasUsed: blockAnalysis.totalGasUsed.toString(),
          transactionGasUsed: ourTransaction ? ourTransaction.gasUsed.toString() : null
        }
      };

      logger.info('Chain execution completed successfully:', result);
      return result;

    } catch (error) {
      logger.error('Chain execution failed:', { 
        error: error.message,
        value,
        fromAddress
      });
      throw error;
    }
  }

  async parallelBlockAnalysis() {
    try {
      logger.info('Starting parallel block analysis');

      // Get the latest block number
      const latestBlock = await monadService.getLatestBlockNumber();
      const latestBlockNum = BigInt(latestBlock);
      
      // Create array of block numbers to analyze
      const blockNumbers = [
        latestBlockNum,
        latestBlockNum - BigInt(1),
        latestBlockNum - BigInt(2)
      ].filter(num => num >= BigInt(0)) // Ensure no negative block numbers
       .map(num => num.toString()); // Convert to strings for the API calls

      logger.info('Analyzing blocks in parallel:', { blockNumbers });

      // Analyze blocks in parallel
      const analysisPromises = blockNumbers.map(blockNumber => 
        monadService.analyzeBlock(blockNumber)
          .catch(error => {
            logger.error('Error analyzing block:', { 
              blockNumber,
              error: error.message
            });
            return null; // Return null for failed analyses
          })
      );

      const results = await Promise.all(analysisPromises);

      // Filter out null results and format the response
      const validResults = results
        .filter(result => result !== null)
        .map(block => ({
          blockNumber: block.blockNumber.toString(),
          timestamp: block.timestamp.toString(),
          transactionCount: block.transactionCount,
          totalGasUsed: block.totalGasUsed.toString()
        }));

      logger.info('Parallel block analysis completed:', {
        analyzedBlocks: validResults.length,
        totalTransactions: validResults.reduce((sum, block) => sum + block.transactionCount, 0)
      });

      return validResults;

    } catch (error) {
      logger.error('Parallel block analysis failed:', { error: error.message });
      throw error;
    }
  }
}

export default new ChainService(); 