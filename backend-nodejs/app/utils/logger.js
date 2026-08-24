import fs from 'fs';
import { appendFile } from 'fs/promises';
import path from 'path';

// Create logs directory if it doesn't exist
const logsDir = path.join(process.cwd(), 'logs');
if (!fs.existsSync(logsDir)) {
    fs.mkdirSync(logsDir, { recursive: true });
}

// Log levels
const LOG_LEVELS = {
    ERROR: 0,
    WARN: 1,
    INFO: 2,
    DEBUG: 3
};

const COLORS = {
    ERROR: '\x1b[31m', // Red
    WARN: '\x1b[33m',  // Yellow
    INFO: '\x1b[36m',  // Cyan
    DEBUG: '\x1b[37m', // White
    RESET: '\x1b[0m'
};

class Logger {
    constructor() {
        this.level = LOG_LEVELS[process.env.LOG_LEVEL?.toUpperCase()] || LOG_LEVELS.INFO;
        this.logToFile = process.env.LOG_TO_FILE === 'true';
        this.logFile = path.join(logsDir, `app-${new Date().toISOString().split('T')[0]}.log`);
    }

    formatMessage(level, message, meta = {}) {
        const timestamp = new Date().toISOString();
        const logEntry = {
            timestamp,
            level,
            message,
            ...meta
        };

        // Console format with colors
        const consoleMessage = `${COLORS[level]}[${timestamp}] ${level}: ${message}${Object.keys(meta).length ? `\n${COLORS.RESET}${JSON.stringify(meta, null, 2)}` : ''}${COLORS.RESET}`;
        
        // File format (JSON)
        const fileMessage = JSON.stringify(logEntry) + '\n';

        return { consoleMessage, fileMessage, logEntry };
    }

    writeToFile(message) {
        if (this.logToFile) {
            try {
                appendFile(this.logFile, message).catch((error) => {
                    console.error('Failed to write to log file:', error);
                });
            } catch (error) {
                console.error('Failed to write to log file:', error);
            }
        }
    }

    log(level, message, meta = {}) {
        if (LOG_LEVELS[level] <= this.level) {
            const { consoleMessage, fileMessage } = this.formatMessage(level, message, meta);
            
            console.log(consoleMessage);
            this.writeToFile(fileMessage);
        }
    }

    error(message, meta = {}) {
        this.log('ERROR', message, meta);
    }

    warn(message, meta = {}) {
        this.log('WARN', message, meta);
    }

    info(message, meta = {}) {
        this.log('INFO', message, meta);
    }

    debug(message, meta = {}) {
        this.log('DEBUG', message, meta);
    }

    // HTTP request logging
    httpLog(req, res, responseTime) {
        const logData = {
            method: req.method,
            url: req.url,
            statusCode: res.statusCode,
            responseTime: `${responseTime}ms`,
            userAgent: req.get('User-Agent'),
            ip: req.ip || req.connection.remoteAddress,
            userId: req.user?.id || 'anonymous'
        };

        const level = res.statusCode >= 400 ? 'ERROR' : 'INFO';
        this.log(level, `${req.method} ${req.url} ${res.statusCode}`, logData);
    }

    // Database operation logging
    dbLog(operation, collection, data = {}) {
        this.debug(`DB ${operation}`, {
            operation,
            collection,
            ...data
        });
    }

    // Authentication logging
    authLog(event, userId, details = {}) {
        this.info(`Auth: ${event}`, {
            event,
            userId,
            ...details
        });
    }
}

// Create singleton instance
const logger = new Logger();

// HTTP logging middleware
export const httpLogger = (req, res, next) => {
    const start = Date.now();
    
    res.on('finish', () => {
        const responseTime = Date.now() - start;
        logger.httpLog(req, res, responseTime);
    });
    
    next();
};

export default logger;
