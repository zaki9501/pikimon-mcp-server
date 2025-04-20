import swaggerJsdoc from 'swagger-jsdoc';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import dotenv from 'dotenv';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const options = {
  definition: {
    openapi: '3.0.0',
    info: {
      title: 'MCP Server API Documentation',
      version: '1.0.0',
      description: 'API documentation for the MCP Server interacting with Monad Testnet',
    },
    servers: [
      {
        url: `http://localhost:${process.env.PORT || 3001}`,
        description: 'Development server',
      },
    ],
  },
  apis: [join(__dirname, '../routes/*.js')], // Absolute path to the API routes
};

const swaggerSpec = swaggerJsdoc(options);

export default swaggerSpec; 