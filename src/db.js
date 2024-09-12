const fs = require('fs');
const sqlite3 = require('sqlite3').verbose();
const log = require('./logger');
const path = require('path');

const dbDir = path.join(__dirname, '../db');

if (!fs.existsSync(dbDir)) {
    fs.mkdirSync(dbDir, { recursive: true });
    log.debug('Database directory created');
}

const genresDb = new sqlite3.Database(path.join(dbDir, 'genres.db'), (err) => {
    if (err) {
        log.error(`Failed to connect to genres.db: ${err.message}`);
    } else {
        log.debug('Connected to genres.db');
    }
});

const cacheDb = new sqlite3.Database(path.join(dbDir, 'cache.db'), (err) => {
    if (err) {
        log.error(`Failed to connect to cache.db: ${err.message}`);
    } else {
        log.debug('Connected to cache.db');
    }
});

genresDb.serialize(() => {
    genresDb.run(`CREATE TABLE IF NOT EXISTS genres (
        genre_id INTEGER,
        genre_name TEXT,
        media_type TEXT,
        language TEXT,
        PRIMARY KEY (genre_id, media_type, language),
        UNIQUE (genre_id, media_type, language)
    )`, (err) => {
        if (err) {
            log.error(`Error creating genres table: ${err.message}`);
        } else {
            log.debug('Genres table is ready');
        }
    });
});

cacheDb.serialize(() => {
    cacheDb.run(`CREATE TABLE IF NOT EXISTS cache (
        key TEXT PRIMARY KEY,
        value TEXT,
        timestamp INTEGER,
        page INTEGER,
        skip INTEGER
    )`, (err) => {
        if (err) {
            log.error(`Error creating cache table: ${err.message}`);
        } else {
            log.debug('Cache table is ready');
        }
    });
});

module.exports = {
    genresDb,
    cacheDb
};
