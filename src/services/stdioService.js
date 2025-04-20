import monadService from './monad.js';
import logger from '../utils/logger.js';

class StdioService {
  constructor() {
    this.isPolling = false;
    this.lastBlock = null;
    this.pollingInterval = null;
    this.POLLING_INTERVAL = 2000;
    this.ERROR_POLLING_INTERVAL = 5000;
  }

  initialize() {
    // Handle input
    process.stdin.setEncoding('utf8');
    process.stdin.on('data', this.handleInput.bind(this));

    // Handle process termination
    process.on('SIGTERM', () => this.cleanup());
    process.on('SIGINT', () => this.cleanup());

    // Start block polling
    this.startBlockPolling();

    // Listen for greeting updates
    monadService.on('greetingUpdated', this.handleGreetingUpdate.bind(this));

    logger.info('Stdio transport initialized');
  }

  async handleInput(data) {
    try {
      const message = JSON.parse(data);
      if (message.type === 'command') {
        await this.handleCommand(message.data);
      }
    } catch (error) {
      this.sendError('Invalid input format');
    }
  }

  async handleCommand(command) {
    try {
      switch (command.action) {
        case 'getBlock':
          const blockNumber = await monadService.getLatestBlockNumber();
          this.sendMessage('blockNumber', { number: blockNumber.toString() });
          break;
        case 'getGreeting':
          const greeting = await monadService.getData();
          this.sendMessage('greeting', { greeting });
          break;
        default:
          this.sendError(`Unknown command: ${command.action}`);
      }
    } catch (error) {
      this.sendError(error.message);
    }
  }

  async startBlockPolling() {
    if (this.isPolling) return;

    try {
      this.isPolling = true;
      this.lastBlock = await monadService.getLatestBlockNumber();
      
      const poll = async () => {
        try {
          const currentBlock = await monadService.getLatestBlockNumber();
          if (BigInt(currentBlock) > BigInt(this.lastBlock)) {
            const block = await monadService.web3.eth.getBlock(currentBlock, true);
            if (block) {
              const blockInfo = {
                number: block.number.toString(),
                hash: block.hash,
                timestamp: block.timestamp.toString(),
                gasUsed: (block.gasUsed || '0').toString(),
                miner: block.miner
              };

              this.sendMessage('newBlock', blockInfo);
              this.lastBlock = currentBlock;
            }
          }
          this.pollingInterval = setTimeout(poll, this.POLLING_INTERVAL);
        } catch (error) {
          logger.error('Error in block polling:', { error: error.message });
          this.pollingInterval = setTimeout(poll, this.ERROR_POLLING_INTERVAL);
        }
      };

      await poll();
      logger.info('Block polling started for stdio transport');
    } catch (error) {
      logger.error('Error starting block polling:', { error: error.message });
      this.isPolling = false;
      setTimeout(() => this.startBlockPolling(), this.ERROR_POLLING_INTERVAL);
    }
  }

  handleGreetingUpdate(eventData) {
    this.sendMessage('greetingUpdated', eventData);
  }

  sendMessage(type, data) {
    const message = JSON.stringify({
      type,
      data,
      timestamp: Date.now()
    });
    process.stdout.write(message + '\n');
  }

  sendError(message) {
    this.sendMessage('error', { message });
  }

  cleanup() {
    if (this.pollingInterval) {
      clearTimeout(this.pollingInterval);
      this.pollingInterval = null;
    }
    this.isPolling = false;
    logger.info('Stdio transport cleaned up');
  }
}

export default new StdioService(); 