import winston from 'winston';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import fs from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Define log format
const logFormat = winston.format.combine(
  winston.format.timestamp(),
  winston.format.errors({ stack: true }),
  winston.format.json()
);

// Set logs directory to project root
const projectRoot = join(dirname(__dirname), '..');
const logsDir = join(projectRoot, 'logs');

// Create the logger instance
const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: logFormat,
  defaultMeta: { service: 'mcp-server' },
  transports: [
    // Write all logs with importance level of 'error' or less to error.log
    new winston.transports.File({
      filename: join(logsDir, 'error.log'),
      level: 'error',
      dirname: logsDir,
      maxsize: 10485760, // 10MB
      maxFiles: 5,
    }),
    // Write all logs with importance level of 'info' or less to combined.log
    new winston.transports.File({
      filename: join(logsDir, 'combined.log'),
      dirname: logsDir,
      maxsize: 10485760, // 10MB
      maxFiles: 5,
    }),
  ],
});

// If we're not in production, log to the console with a simpler format
if (process.env.NODE_ENV !== 'production') {
  logger.add(
    new winston.transports.Console({
      format: winston.format.combine(
        winston.format.colorize(),
        winston.format.simple()
      ),
    })
  );
}

// Create a stream object with a write function that will be used by Morgan
const stream = {
  write: (message) => {
    logger.info(message.trim());
  },
};

// Ensure logs directory exists
if (!fs.existsSync(logsDir)) {
  fs.mkdirSync(logsDir, { recursive: true });
}

export { logger, stream };
export default logger; 