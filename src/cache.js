const { cacheDb } = require('./db');
const log = require('./logger');

const cacheDurationToSeconds = (duration) => {
    const match = duration.match(/^(\d+)([dh])$/);
    if (!match) throw new Error('Invalid cache duration format');

    const [ , value, unit ] = match;
    const number = parseInt(value, 10);

    switch (unit) {
        case 'd': return number * 86400;
        case 'h': return number * 3600;
        default: throw new Error('Invalid cache duration unit');
    }
};

const setCache = (key, value, duration = '3d', page = 1, skip = 0, genre = null, year = null, rating = null, mediaType = null) => {
    try {
        genre = genre === null ? "undefined" : genre;
        year = year === null ? "undefined" : year;
        rating = rating === null ? "undefined" : rating;

        const durationInSeconds = cacheDurationToSeconds(duration);
        const expireTime = Math.floor(Date.now() / 1000) + durationInSeconds;

        const query = `INSERT OR REPLACE INTO cache (key, value, timestamp, page, skip, genre, year, rating, mediaType) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`;
        cacheDb.run(query, [key, JSON.stringify(value), expireTime, page, skip, genre, year, rating, mediaType], (err) => {
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
        cacheDb.get(
            `SELECT value, timestamp, page, skip, genre, year, rating, mediaType FROM cache WHERE key = ?`,
            [key],
            (err, row) => {
                if (err) {
                    log.error(`Error retrieving cache for key ${key}: ${err.message}`);
                    return reject(err);
                }
                if (!row) {
                    log.debug(`Cache miss for key ${key}`);
                    return resolve(null);
                }

                const isCacheValid = (Date.now() / 1000 - row.timestamp) < cacheDurationInSeconds;
                if (isCacheValid) {
                    log.debug(`Cache hit for key ${key}`);
                    resolve({
                        value: JSON.parse(row.value),
                        page: row.page,
                        skip: row.skip,
                        genre: row.genre,
                        year: row.year,
                        rating: row.rating,
                        mediaType: row.mediaType
                    });
                } else {
                    log.debug(`Cache expired for key ${key}`);
                    resolve(null);
                }
            }
        );
    });
};

module.exports = {
    setCache,
    getCache
};
