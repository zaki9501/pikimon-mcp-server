import Web3 from 'web3';
import dotenv from 'dotenv';

dotenv.config();

class Web3Service {
  constructor() {
    this.web3 = new Web3(process.env.MONAD_RPC_URL || 'http://localhost:8545');
  }

  async getBlockNumber() {
    try {
      return await this.web3.eth.getBlockNumber();
    } catch (error) {
      console.error('Error getting block number:', error);
      throw error;
    }
  }

  async getBalance(address) {
    try {
      const balance = await this.web3.eth.getBalance(address);
      return this.web3.utils.fromWei(balance, 'ether');
    } catch (error) {
      console.error('Error getting balance:', error);
      throw error;
    }
  }

  async sendTransaction(from, to, value) {
    try {
      const transaction = {
        from,
        to,
        value: this.web3.utils.toWei(value.toString(), 'ether'),
        gas: '21000'
      };
      return await this.web3.eth.sendTransaction(transaction);
    } catch (error) {
      console.error('Error sending transaction:', error);
      throw error;
    }
  }
}

export default new Web3Service(); 