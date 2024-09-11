const { cacheDb } = require('./db');
const log = require('./logger');

const cacheDurationToSeconds = (duration) => {
    const match = duration.match(/^(\d+)([dh])$/);
    if (!match) {
        throw new Error('Invalid cache duration format');
    }

    const [ , value, unit ] = match;
    const number = parseInt(value, 10);

    if (unit === 'd') {
        return number * 24 * 60 * 60;
    } else if (unit === 'h') {
        return number * 60 * 60;
    }

    throw new Error('Invalid cache duration unit');
};

const setCache = (key, value, duration = '3d', page = 1, skip = 0) => {
    try {
        const durationInSeconds = cacheDurationToSeconds(duration);
        const timestamp = Math.floor(Date.now() / 1000);
        const expireTime = timestamp + durationInSeconds;

        const query = `INSERT OR REPLACE INTO cache (key, value, timestamp, page, skip) VALUES (?, ?, ?, ?, ?)`;
        cacheDb.run(query, [key, JSON.stringify(value), expireTime, page, skip], (err) => {
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

const getCache = (key, cacheDuration = '3d') => {
    const cacheDurationInSeconds = cacheDurationToSeconds(cacheDuration);

    return new Promise((resolve, reject) => {
        cacheDb.get(`SELECT value, timestamp, page, skip FROM cache WHERE key = ?`,
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
                            resolve({
                                value: JSON.parse(row.value),
                                page: row.page,
                                skip: row.skip
                            });
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
