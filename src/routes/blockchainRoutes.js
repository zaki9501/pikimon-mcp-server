import express from 'express';
import web3Service from '../services/web3Service.js';

const router = express.Router();

router.get('/block-number', async (req, res, next) => {
  try {
    const blockNumber = await web3Service.getBlockNumber();
    res.json({ blockNumber });
  } catch (error) {
    next(error);
  }
});

router.get('/balance/:address', async (req, res, next) => {
  try {
    const balance = await web3Service.getBalance(req.params.address);
    res.json({ balance });
  } catch (error) {
    next(error);
  }
});

router.post('/send-transaction', async (req, res, next) => {
  try {
    const { from, to, value } = req.body;
    const transaction = await web3Service.sendTransaction(from, to, value);
    res.json({ transaction });
  } catch (error) {
    next(error);
  }
});

export default router; 