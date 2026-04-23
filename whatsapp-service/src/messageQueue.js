/**
 * Message Queue with rate limiting
 * Prevents WhatsApp from blocking due to too many messages
 */

const PQueue = require('p-queue').default;

class MessageQueue {
    constructor(logger) {
        this.logger = logger;

        // Rate limit: 20 messages per minute by default
        const rateLimit = parseInt(process.env.RATE_LIMIT_PER_MINUTE) || 20;

        this.queue = new PQueue({
            concurrency: 1,           // Send one message at a time
            intervalCap: rateLimit,   // Max messages per interval
            interval: 60000,          // 1 minute interval
            carryoverConcurrencyCount: true
        });

        this.logger.info({ rateLimit }, 'Message queue initialized');

        // Log queue status periodically
        this.queue.on('active', () => {
            this.logger.debug({
                size: this.queue.size,
                pending: this.queue.pending
            }, 'Queue processing');
        });

        this.queue.on('idle', () => {
            this.logger.debug('Queue is idle');
        });

        this.queue.on('error', (error) => {
            this.logger.error({ error }, 'Queue error');
        });
    }

    /**
     * Add a message sending function to the queue
     * @param {Function} fn - Async function that sends the message
     * @param {number} priority - Priority level (higher = more urgent)
     * @returns {Promise} - Resolves when message is sent
     */
    async add(fn, priority = 0) {
        return this.queue.add(fn, { priority });
    }

    /**
     * Get number of messages waiting in queue
     */
    get size() {
        return this.queue.size;
    }

    /**
     * Get number of messages currently being processed
     */
    get pending() {
        return this.queue.pending;
    }

    /**
     * Check if queue is idle
     */
    get isIdle() {
        return this.queue.size === 0 && this.queue.pending === 0;
    }

    /**
     * Clear all pending messages from queue
     */
    clear() {
        this.queue.clear();
        this.logger.info('Queue cleared');
    }

    /**
     * Pause the queue
     */
    pause() {
        this.queue.pause();
        this.logger.info('Queue paused');
    }

    /**
     * Resume the queue
     */
    resume() {
        this.queue.start();
        this.logger.info('Queue resumed');
    }
}

module.exports = { MessageQueue };
