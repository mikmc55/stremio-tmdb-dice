const { cacheDb } = require('./db');
const log = require('./logger');

// Fonction pour définir le cache
const setCache = (key, value, duration = 3 * 24 * 60 * 60) => {
    const timestamp = Math.floor(Date.now() / 1000);
    const expireTime = timestamp + duration; // durée en secondes

    const query = `INSERT OR REPLACE INTO cache (key, value, timestamp) VALUES (?, ?, ?)`;
    cacheDb.run(query, [key, JSON.stringify(value), expireTime], (err) => {
        if (err) {
            log.error(`Failed to set cache for key ${key}: ${err.message}`);
        } else {
            log.debug(`Cache set for key ${key} with duration ${duration} seconds`);
        }
    });
};

// Fonction pour récupérer le cache
const getCache = (key) => {
    return new Promise((resolve, reject) => {
        const timestamp = Math.floor(Date.now() / 1000);

        const query = `SELECT value FROM cache WHERE key = ? AND timestamp > ?`;
        cacheDb.get(query, [key, timestamp], (err, row) => {
            if (err) {
                log.error(`Failed to get cache for key ${key}: ${err.message}`);
                reject(err);
            } else if (row) {
                log.debug(`Cache hit for key ${key}`);
                resolve(JSON.parse(row.value));
            } else {
                log.debug(`Cache miss for key ${key}`);
                resolve(null);
            }
        });
    });
};

module.exports = {
    setCache,
    getCache
};
