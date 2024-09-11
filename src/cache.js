const { cacheDb } = require('./db');
const log = require('./logger');

// Fonction pour convertir la durée en secondes
const cacheDurationToSeconds = (duration) => {
    const match = duration.match(/^(\d+)([dh])$/);
    if (!match) {
        throw new Error('Invalid cache duration format');
    }

    const [ , value, unit ] = match;
    const number = parseInt(value, 10);

    if (unit === 'd') {
        return number * 24 * 60 * 60; // jours en secondes
    } else if (unit === 'h') {
        return number * 60 * 60; // heures en secondes
    }

    throw new Error('Invalid cache duration unit');
};

// Fonction pour définir le cache
const setCache = (key, value, duration = '3d') => {
    try {
        const durationInSeconds = cacheDurationToSeconds(duration);
        const timestamp = Math.floor(Date.now() / 1000);
        const expireTime = timestamp + durationInSeconds; // durée en secondes

        const query = `INSERT OR REPLACE INTO cache (key, value, timestamp) VALUES (?, ?, ?)`;
        cacheDb.run(query, [key, JSON.stringify(value), expireTime], (err) => {
            if (err) {
                log.error(`Failed to set cache for key ${key}: ${err.message}`);
            } else {
                log.debug(`Cache set for key ${key} with duration ${duration}`);
            }
        });
    } catch (error) {
        log.error(`Error in setting cache: ${error.message}`);
    }
};

// Fonction pour obtenir le cache
const getCache = (key, cacheDuration = '3d') => {
    const cacheDurationInSeconds = cacheDurationToSeconds(cacheDuration);

    return new Promise((resolve, reject) => {
        cacheDb.get(`SELECT value, timestamp FROM cache WHERE key = ?`,
            [key],
            (err, row) => {
                if (err) {
                    log.error('Error getting cache:', err);
                    reject(err);
                } else {
                    if (row) {
                        const isCacheValid = (Date.now() / 1000 - row.timestamp) < cacheDurationInSeconds;
                        if (isCacheValid) {
                            log.debug('Cache hit');
                            resolve(JSON.parse(row.value));
                        } else {
                            log.debug('Cache expired');
                            resolve(null);
                        }
                    } else {
                        log.debug('Cache miss');
                        resolve(null);
                    }
                }
            }
        );
    });
};

module.exports = {
    setCache,
    getCache
};
