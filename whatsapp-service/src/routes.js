/**
 * Express routes for WhatsApp API
 */

function setupRoutes(app, whatsappManager, logger) {

    // Health check
    app.get('/health', (req, res) => {
        const status = whatsappManager.getStatus();
        res.json({
            success: true,
            status: 'running',
            whatsapp: status.state,
            timestamp: new Date().toISOString()
        });
    });

    // Get WhatsApp connection status
    app.get('/status', (req, res) => {
        try {
            const status = whatsappManager.getStatus();
            res.json({
                success: true,
                ...status
            });
        } catch (error) {
            logger.error({ error }, 'Failed to get status');
            res.status(500).json({
                success: false,
                error: 'Failed to get status',
                message: error.message
            });
        }
    });

    // Get QR code for authentication
    app.get('/qr', (req, res) => {
        try {
            const qrCode = whatsappManager.getQRCode();
            const status = whatsappManager.getStatus();

            if (status.connected) {
                return res.json({
                    success: true,
                    connected: true,
                    phoneNumber: status.phoneNumber,
                    message: 'Already connected'
                });
            }

            if (!qrCode) {
                return res.json({
                    success: false,
                    connected: false,
                    state: status.state,
                    message: 'QR code not available. Service may be initializing or already connected.'
                });
            }

            res.json({
                success: true,
                connected: false,
                qrCode: qrCode,  // Base64 data URL
                state: status.state
            });
        } catch (error) {
            logger.error({ error }, 'Failed to get QR code');
            res.status(500).json({
                success: false,
                error: 'Failed to get QR code',
                message: error.message
            });
        }
    });

    // Logout and clear session
    app.post('/logout', async (req, res) => {
        try {
            const success = await whatsappManager.logout();
            res.json({
                success,
                message: success ? 'Logged out successfully' : 'Failed to logout'
            });
        } catch (error) {
            logger.error({ error }, 'Failed to logout');
            res.status(500).json({
                success: false,
                error: 'Failed to logout',
                message: error.message
            });
        }
    });

    // Reconnect (reinitialize connection)
    app.post('/reconnect', async (req, res) => {
        try {
            await whatsappManager.initialize();
            res.json({
                success: true,
                message: 'Reconnection initiated'
            });
        } catch (error) {
            logger.error({ error }, 'Failed to reconnect');
            res.status(500).json({
                success: false,
                error: 'Failed to reconnect',
                message: error.message
            });
        }
    });

    // Get list of WhatsApp groups
    app.get('/groups', async (req, res) => {
        try {
            const status = whatsappManager.getStatus();
            if (!status.connected) {
                return res.status(400).json({
                    success: false,
                    error: 'WhatsApp not connected',
                    state: status.state
                });
            }

            const groups = await whatsappManager.getGroups();
            res.json({
                success: true,
                count: groups.length,
                groups
            });
        } catch (error) {
            logger.error({ error }, 'Failed to get groups');
            res.status(500).json({
                success: false,
                error: 'Failed to get groups',
                message: error.message
            });
        }
    });

    // Send message to individual phone number
    app.post('/send', async (req, res) => {
        try {
            const { phone, message } = req.body;

            if (!phone || !message) {
                return res.status(400).json({
                    success: false,
                    error: 'Missing required fields',
                    required: ['phone', 'message']
                });
            }

            const status = whatsappManager.getStatus();
            if (!status.connected) {
                return res.status(400).json({
                    success: false,
                    error: 'WhatsApp not connected',
                    state: status.state
                });
            }

            const result = await whatsappManager.sendMessage(phone, message);
            res.json({
                success: true,
                ...result
            });
        } catch (error) {
            logger.error({ error }, 'Failed to send message');
            res.status(500).json({
                success: false,
                error: 'Failed to send message',
                message: error.message
            });
        }
    });

    // Send message to group
    app.post('/send-group', async (req, res) => {
        try {
            const { groupJid, message } = req.body;

            if (!groupJid || !message) {
                return res.status(400).json({
                    success: false,
                    error: 'Missing required fields',
                    required: ['groupJid', 'message']
                });
            }

            const status = whatsappManager.getStatus();
            if (!status.connected) {
                return res.status(400).json({
                    success: false,
                    error: 'WhatsApp not connected',
                    state: status.state
                });
            }

            const result = await whatsappManager.sendGroupMessage(groupJid, message);
            res.json({
                success: true,
                ...result
            });
        } catch (error) {
            logger.error({ error }, 'Failed to send group message');
            res.status(500).json({
                success: false,
                error: 'Failed to send group message',
                message: error.message
            });
        }
    });

    // Check if phone number exists on WhatsApp
    app.get('/check-number/:phone', async (req, res) => {
        try {
            const { phone } = req.params;

            const status = whatsappManager.getStatus();
            if (!status.connected) {
                return res.status(400).json({
                    success: false,
                    error: 'WhatsApp not connected',
                    state: status.state
                });
            }

            const exists = await whatsappManager.checkNumberExists(phone);
            res.json({
                success: true,
                phone,
                exists
            });
        } catch (error) {
            logger.error({ error }, 'Failed to check number');
            res.status(500).json({
                success: false,
                error: 'Failed to check number',
                message: error.message
            });
        }
    });

    // Get queue status
    app.get('/queue', (req, res) => {
        const status = whatsappManager.getStatus();
        res.json({
            success: true,
            queueSize: status.queueSize,
            queuePending: status.queuePending
        });
    });

    // 404 handler
    app.use((req, res) => {
        res.status(404).json({
            success: false,
            error: 'Not found',
            path: req.path
        });
    });
}

module.exports = { setupRoutes };
