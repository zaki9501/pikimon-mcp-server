import dotenv from 'dotenv';

dotenv.config();

export const contractConfig = {
    address: process.env.CONTRACT_ADDRESS,
    abi: [
        {
            "inputs": [{"internalType": "string", "name": "_greeting", "type": "string"}],
            "stateMutability": "nonpayable",
            "type": "constructor"
        },
        {
            "inputs": [],
            "name": "greeting",
            "outputs": [{"internalType": "string", "name": "", "type": "string"}],
            "stateMutability": "view",
            "type": "function"
        },
        {
            "inputs": [{"internalType": "string", "name": "_greeting", "type": "string"}],
            "name": "setGreeting",
            "outputs": [],
            "stateMutability": "nonpayable",
            "type": "function"
        },
        {
            "anonymous": false,
            "inputs": [
                {
                    "indexed": false,
                    "internalType": "string",
                    "name": "newGreeting",
                    "type": "string"
                },
                {
                    "indexed": true,
                    "internalType": "address",
                    "name": "updatedBy",
                    "type": "address"
                }
            ],
            "name": "GreetingUpdated",
            "type": "event"
        }
    ]
};
