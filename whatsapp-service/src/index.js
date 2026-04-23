/**
 * HMD WhatsApp Service
 * Express server that wraps Baileys for WhatsApp Web API
 */

require('dotenv').config();
const express = require('express');
const cors = require('cors');
const pino = require('pino');
const { setupRoutes } = require('./routes');
const { WhatsAppManager } = require('./whatsapp');

// Initialize logger
// pino-pretty is disabled when running as a compiled pkg executable
// because worker thread transports can't resolve modules in the pkg snapshot
const isPkg = typeof process.pkg !== 'undefined';
const logger = pino({
    level: process.env.LOG_LEVEL || 'info',
    ...(isPkg ? {} : {
        transport: {
            target: 'pino-pretty',
            options: {
                colorize: true,
                translateTime: 'SYS:standard',
                ignore: 'pid,hostname'
            }
        }
    })
});

// Initialize Express app
const app = express();
const PORT = process.env.PORT || 3002;

// Middleware
app.use(cors());
app.use(express.json());

// Request logging
app.use((req, res, next) => {
    logger.info({ method: req.method, url: req.url }, 'Incoming request');
    next();
});

// Initialize WhatsApp Manager
const whatsappManager = new WhatsAppManager(logger);

// Setup routes
setupRoutes(app, whatsappManager, logger);

// Error handling middleware
app.use((err, req, res, next) => {
    logger.error({ err, url: req.url }, 'Unhandled error');
    res.status(500).json({
        success: false,
        error: 'Internal server error',
        message: err.message
    });
});

// Start server
app.listen(PORT, () => {
    logger.info(`WhatsApp service running on port ${PORT}`);

    // Initialize WhatsApp connection
    whatsappManager.initialize().catch(err => {
        logger.error({ err }, 'Failed to initialize WhatsApp');
    });
});

// Graceful shutdown
process.on('SIGINT', async () => {
    logger.info('Shutting down...');
    await whatsappManager.logout();
    process.exit(0);
});

process.on('SIGTERM', async () => {
    logger.info('Shutting down...');
    await whatsappManager.logout();
    process.exit(0);
});
