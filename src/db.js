const fs = require('fs');
const sqlite3 = require('sqlite3').verbose();
const log = require('./logger');
const path = require('path');
const axios = require('axios');

const TMDB_API_KEY = process.env.TMDB_API_KEY;
const TMDB_BASE_URL = 'https://api.themoviedb.org/3';

// Base de données SQLite pour les genres
const dbDir = path.join(__dirname, '../db');

if (!fs.existsSync(dbDir)) {
    fs.mkdirSync(dbDir, { recursive: true });
    log.debug('Created db directory');
}

const genresDb = new sqlite3.Database(path.join(dbDir, 'genres.db'), (err) => {
    if (err) {
        log.error('Failed to connect to genres.db:', err);
    } else {
        log.debug('Connected to genres.db successfully');
    }
});

// Création de la table des genres avec une clé primaire composite
genresDb.serialize(() => {
    genresDb.run(`CREATE TABLE IF NOT EXISTS genres (
        genre_id INTEGER,
        genre_name TEXT,
        media_type TEXT,
        PRIMARY KEY (genre_id, media_type)
    )`, (err) => {
        if (err) {
            log.error('Error creating genres table:', err);
        } else {
            log.debug('Genres table created or already exists');
        }
    });
});

module.exports = {
    genresDb
};
