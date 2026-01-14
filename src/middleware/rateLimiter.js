const rateLimit = require('express-rate-limit');
const RedisStore = require('rate-limit-redis').RedisStore;
const client = require('../config/redisClient');

const limiter = rateLimit({
	windowMs: 1 * 60 * 1000, // 1 minute window
	max: 10, // Limit each IP to 10 requests per windowMs
	standardHeaders: true, // Return rate limit info in the `RateLimit-*` headers
	legacyHeaders: false, // Disable the `X-RateLimit-*` headers
    // Redis store configuration
	store: new RedisStore({
		sendCommand: (...args) => client.sendCommand(args),
	}),
    handler: (req, res, next, options) => {
        res.status(options.statusCode).json({
            error: options.message,
            retryAfter: Math.ceil(options.windowMs / 1000) + " seconds"
        });
    },
	message: 'Too many requests from this IP, please try again after a minute'
});

module.exports = limiter;
