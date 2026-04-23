/**
 * WhatsApp Manager using Baileys
 * Handles connection, authentication, and message sending
 */

const { default: makeWASocket, DisconnectReason, useMultiFileAuthState, fetchLatestBaileysVersion } = require('@whiskeysockets/baileys');
const QRCode = require('qrcode');
const path = require('path');
const fs = require('fs');
const { MessageQueue } = require('./messageQueue');

class WhatsAppManager {
    constructor(logger) {
        this.logger = logger;
        this.socket = null;
        this.qrCode = null;
        this.connectionState = 'disconnected'; // disconnected, connecting, connected
        this.phoneNumber = null;
        this.messageQueue = new MessageQueue(logger);
        // In a pkg-compiled exe, __dirname is the read-only virtual snapshot.
        // Use HMD_DIR env var (set by NSSM) or the real exe directory instead.
        const isPkg = typeof process.pkg !== 'undefined';
        if (isPkg) {
            const baseDir = process.env.HMD_DIR || path.dirname(process.execPath);
            this.sessionPath = path.join(baseDir, 'whatsapp-sessions');
        } else {
            this.sessionPath = path.join(__dirname, '..', 'sessions');
        }
        this.reconnectAttempts = 0;
        this.maxReconnectAttempts = 5;
        this.isCleaningUp = false; // Prevent concurrent cleanup operations

        // Ensure sessions directory exists
        if (!fs.existsSync(this.sessionPath)) {
            fs.mkdirSync(this.sessionPath, { recursive: true });
        }
    }

    async initialize() {
        try {
            this.connectionState = 'connecting';
            this.logger.info('Initializing WhatsApp connection...');

            // Check for corrupted session and clean if necessary
            await this.cleanupCorruptedSession();

            // Get latest Baileys version
            const { version, isLatest } = await fetchLatestBaileysVersion();
            this.logger.info({ version, isLatest }, 'Baileys version info');

            // Load auth state
            const { state, saveCreds } = await useMultiFileAuthState(this.sessionPath);

            // Create socket
            this.socket = makeWASocket({
                version,
                auth: state,
                printQRInTerminal: true,
                logger: this.logger.child({ module: 'baileys' }),
                browser: ['HMD System', 'Chrome', '120.0.0'],
                connectTimeoutMs: 60000,
                defaultQueryTimeoutMs: 60000,
                keepAliveIntervalMs: 30000,
                emitOwnEvents: false,
                fireInitQueries: true,
                generateHighQualityLinkPreview: false,
                syncFullHistory: false,
                markOnlineOnConnect: false
            });

            // Handle connection updates
            this.socket.ev.on('connection.update', async (update) => {
                const { connection, lastDisconnect, qr } = update;

                if (qr) {
                    this.logger.info('QR Code received');
                    this.qrCode = await QRCode.toDataURL(qr);
                    this.connectionState = 'waiting_for_scan';
                }

                if (connection === 'close') {
                    const statusCode = lastDisconnect?.error?.output?.statusCode;
                    const shouldReconnect = statusCode !== DisconnectReason.loggedOut &&
                                           statusCode !== 401 &&
                                           statusCode !== 403;

                    this.logger.warn({ statusCode, shouldReconnect }, 'Connection closed');
                    this.connectionState = 'disconnected';
                    this.qrCode = null;

                    // Close socket first to release file locks
                    if (this.socket) {
                        this.socket.ev.removeAllListeners();
                        this.socket = null;
                    }

                    if (shouldReconnect && this.reconnectAttempts < this.maxReconnectAttempts) {
                        this.reconnectAttempts++;
                        const delay = Math.min(1000 * Math.pow(2, this.reconnectAttempts), 30000);
                        this.logger.info({ attempt: this.reconnectAttempts, delay }, 'Reconnecting...');
                        setTimeout(() => this.initialize(), delay);
                    } else if (statusCode === DisconnectReason.loggedOut || statusCode === 401 || statusCode === 403) {
                        // Prevent concurrent cleanup operations
                        if (this.isCleaningUp) {
                            this.logger.info('Cleanup already in progress, skipping...');
                            return;
                        }

                        this.isCleaningUp = true;
                        this.logger.info('Logged out or unauthorized, clearing session');
                        this.phoneNumber = null;

                        // Use longer delay and force cleanup
                        setTimeout(async () => {
                            try {
                                await this.forceCleanSession();
                                this.reconnectAttempts = 0;
                                this.isCleaningUp = false;
                                // Re-initialize to get a new QR code
                                await this.initialize();
                            } catch (err) {
                                this.logger.error({ err }, 'Failed during cleanup and reinitialize');
                                this.isCleaningUp = false;
                            }
                        }, 3000); // Longer delay to ensure file handles are released
                    }
                }

                if (connection === 'open') {
                    this.logger.info('WhatsApp connected successfully!');
                    this.connectionState = 'connected';
                    this.qrCode = null;
                    this.reconnectAttempts = 0;

                    // Get connected phone number
                    if (this.socket.user) {
                        this.phoneNumber = this.socket.user.id.split(':')[0];
                        this.logger.info({ phoneNumber: this.phoneNumber }, 'Connected as');
                    }
                }
            });

            // Handle credentials update
            this.socket.ev.on('creds.update', saveCreds);

            // Handle messages (for logging/debugging)
            this.socket.ev.on('messages.upsert', (m) => {
                if (m.type === 'notify') {
                    this.logger.debug({ count: m.messages.length }, 'New messages received');
                }
            });

        } catch (error) {
            this.logger.error({ error }, 'Failed to initialize WhatsApp');
            this.connectionState = 'disconnected';
            throw error;
        }
    }

    async clearSession() {
        try {
            if (fs.existsSync(this.sessionPath)) {
                // Try multiple times with delay for locked files
                for (let i = 0; i < 3; i++) {
                    try {
                        fs.rmSync(this.sessionPath, { recursive: true, force: true });
                        break;
                    } catch (e) {
                        if (i < 2) {
                            this.logger.warn({ attempt: i + 1 }, 'Session directory busy, retrying...');
                            await new Promise(resolve => setTimeout(resolve, 1000));
                        }
                    }
                }
                fs.mkdirSync(this.sessionPath, { recursive: true });
            }
            this.logger.info('Session cleared');
        } catch (error) {
            this.logger.error({ error }, 'Failed to clear session');
        }
    }

    async forceCleanSession() {
        // More aggressive session cleanup - delete individual files first
        this.logger.info('Force cleaning session...');
        try {
            if (fs.existsSync(this.sessionPath)) {
                // First, try to delete individual files
                const files = fs.readdirSync(this.sessionPath);
                for (const file of files) {
                    const filePath = path.join(this.sessionPath, file);
                    try {
                        fs.unlinkSync(filePath);
                        this.logger.debug({ file }, 'Deleted session file');
                    } catch (e) {
                        this.logger.warn({ file, error: e.message }, 'Could not delete file, will retry');
                    }
                }

                // Wait a moment for any remaining handles
                await new Promise(resolve => setTimeout(resolve, 500));

                // Try to remove the directory
                for (let i = 0; i < 5; i++) {
                    try {
                        fs.rmSync(this.sessionPath, { recursive: true, force: true });
                        this.logger.info('Session directory removed');
                        break;
                    } catch (e) {
                        if (i < 4) {
                            this.logger.warn({ attempt: i + 1 }, 'Directory still busy, waiting...');
                            await new Promise(resolve => setTimeout(resolve, 1000));
                        } else {
                            // Last resort: just delete the creds.json to invalidate session
                            const credsFile = path.join(this.sessionPath, 'creds.json');
                            if (fs.existsSync(credsFile)) {
                                try {
                                    fs.unlinkSync(credsFile);
                                    this.logger.info('Deleted creds.json as fallback');
                                } catch (ce) {
                                    this.logger.error({ error: ce.message }, 'Could not delete creds.json');
                                }
                            }
                        }
                    }
                }

                // Recreate the directory
                fs.mkdirSync(this.sessionPath, { recursive: true });
            }
            this.logger.info('Force clean completed');
        } catch (error) {
            this.logger.error({ error }, 'Force clean session failed');
            // Still try to create the directory
            try {
                fs.mkdirSync(this.sessionPath, { recursive: true });
            } catch (e) {
                // Ignore
            }
        }
    }

    async cleanupCorruptedSession() {
        // Check if session exists and has auth files
        const credsFile = path.join(this.sessionPath, 'creds.json');

        if (!fs.existsSync(this.sessionPath)) {
            this.logger.info('No existing session found, starting fresh');
            return;
        }

        // Check if creds.json exists and is valid
        if (fs.existsSync(credsFile)) {
            try {
                const creds = JSON.parse(fs.readFileSync(credsFile, 'utf-8'));
                // Basic validation - check if it has required fields
                if (creds.me?.id || creds.registered) {
                    this.logger.info('Valid session found, attempting to restore');
                    return;
                }
            } catch (e) {
                this.logger.warn('Session creds file corrupted, will clear');
            }
        }

        // Check for any .json files (partial session)
        const sessionFiles = fs.readdirSync(this.sessionPath).filter(f => f.endsWith('.json'));

        if (sessionFiles.length > 0 && !fs.existsSync(credsFile)) {
            this.logger.warn('Incomplete session detected (missing creds.json), clearing...');
            await this.clearSession();
        }
    }

    async logout(reinitialize = true) {
        try {
            // Remove all event listeners first to prevent callbacks during logout
            if (this.socket) {
                this.socket.ev.removeAllListeners();
                try {
                    await this.socket.logout();
                } catch (logoutErr) {
                    // Socket logout may fail if already disconnected, that's ok
                    this.logger.warn({ error: logoutErr.message }, 'Socket logout failed (may already be disconnected)');
                }
                this.socket = null;
            }

            // Clear state
            this.connectionState = 'disconnected';
            this.qrCode = null;
            this.phoneNumber = null;
            this.reconnectAttempts = 0;

            // Clear session files
            await this.clearSession();
            this.logger.info('Logged out successfully');

            // Reinitialize to get new QR code (after a short delay)
            if (reinitialize) {
                this.logger.info('Reinitializing for new QR code...');
                setTimeout(() => {
                    this.initialize().catch(err => {
                        this.logger.error({ err }, 'Failed to reinitialize after logout');
                    });
                }, 1500);
            }

            return true;
        } catch (error) {
            this.logger.error({ error }, 'Failed to logout');
            // Try to clear session anyway
            try {
                await this.clearSession();
            } catch (e) {
                // Ignore
            }
            return false;
        }
    }

    getStatus() {
        return {
            connected: this.connectionState === 'connected',
            state: this.connectionState,
            phoneNumber: this.phoneNumber,
            queueSize: this.messageQueue.size,
            queuePending: this.messageQueue.pending
        };
    }

    getQRCode() {
        return this.qrCode;
    }

    async sendMessage(phoneNumber, message) {
        if (this.connectionState !== 'connected') {
            throw new Error('WhatsApp not connected');
        }

        // Format phone number (ensure it has @s.whatsapp.net)
        const jid = this.formatPhoneNumber(phoneNumber);

        return this.messageQueue.add(async () => {
            try {
                await this.socket.sendMessage(jid, { text: message });
                this.logger.info({ to: jid }, 'Message sent');
                return { success: true, jid };
            } catch (error) {
                this.logger.error({ error, to: jid }, 'Failed to send message');
                throw error;
            }
        });
    }

    async sendGroupMessage(groupJid, message) {
        if (this.connectionState !== 'connected') {
            throw new Error('WhatsApp not connected');
        }

        // Ensure group JID format
        const jid = groupJid.includes('@g.us') ? groupJid : `${groupJid}@g.us`;

        return this.messageQueue.add(async () => {
            try {
                await this.socket.sendMessage(jid, { text: message });
                this.logger.info({ to: jid }, 'Group message sent');
                return { success: true, jid };
            } catch (error) {
                this.logger.error({ error, to: jid }, 'Failed to send group message');
                throw error;
            }
        });
    }

    async getGroups() {
        if (this.connectionState !== 'connected') {
            throw new Error('WhatsApp not connected');
        }

        try {
            const groups = await this.socket.groupFetchAllParticipating();
            return Object.entries(groups).map(([jid, group]) => ({
                jid,
                name: group.subject,
                participantsCount: group.participants?.length || 0,
                createdAt: group.creation ? new Date(group.creation * 1000).toISOString() : null,
                description: group.desc || null
            }));
        } catch (error) {
            this.logger.error({ error }, 'Failed to fetch groups');
            throw error;
        }
    }

    formatPhoneNumber(phone) {
        // Remove all non-digit characters
        let cleaned = phone.replace(/\D/g, '');

        // Add country code if not present (assuming India +91)
        if (cleaned.length === 10) {
            cleaned = '91' + cleaned;
        }

        return `${cleaned}@s.whatsapp.net`;
    }

    async checkNumberExists(phoneNumber) {
        if (this.connectionState !== 'connected') {
            throw new Error('WhatsApp not connected');
        }

        try {
            const jid = this.formatPhoneNumber(phoneNumber);
            const [result] = await this.socket.onWhatsApp(jid);
            return result?.exists || false;
        } catch (error) {
            this.logger.error({ error, phoneNumber }, 'Failed to check number');
            return false;
        }
    }
}

module.exports = { WhatsAppManager };
