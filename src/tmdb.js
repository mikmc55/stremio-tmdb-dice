const axios = require('axios');
const log = require('./logger');
const { genresDb, cacheDb } = require('./db');
const { getCache, setCache } = require('./cache');
const queue = require('./ratelimit');

const TMDB_API_KEY = process.env.TMDB_API_KEY;
const TMDB_BASE_URL = 'https://api.themoviedb.org/3';

const getGenreId = (mediaType, genreName) => {
    return new Promise((resolve, reject) => {
        const query = `SELECT genre_id FROM genres WHERE media_type = ? AND genre_name = ?`;

        genresDb.get(query, [mediaType, genreName], (err, row) => {
            if (err) {
                reject(err);
            } else {
                resolve(row ? row.genre_id : null);
            }
        });
    });
};

const determinePageFromSkip = async (skip, catalogDb) => {
    try {
        const cachedEntry = await new Promise((resolve, reject) => {
            catalogDb.get(
                "SELECT page, skip FROM cache WHERE skip = ? ORDER BY skip DESC LIMIT 1",
                [skip],
                (err, row) => {
                    if (err) {
                        reject(err);
                    } else {
                        resolve(row);
                    }
                }
            );
        });

        if (cachedEntry) {
            log.debug('Cached Entry:', cachedEntry);
            log.debug('Determined Page from Cache:', cachedEntry.page);
            return cachedEntry.page;
        }

        const lastEntry = await new Promise((resolve, reject) => {
            catalogDb.get(
                "SELECT page, skip FROM cache ORDER BY skip DESC LIMIT 1",
                (err, row) => {
                    if (err) {
                        reject(err);
                    } else {
                        resolve(row);
                    }
                }
            );
        });

        log.debug('Last Entry:', lastEntry);

        if (lastEntry) {
            log.debug('Current Skip:', skip, 'Last Skip:', lastEntry.skip);

            if (skip > lastEntry.skip) {
                log.debug('Determined Page:', lastEntry.page + 1);
                return lastEntry.page + 1;
            }
        }

        log.debug('Default Page:', 1);
        return 1;
    } catch (error) {
        log.error('Error in determinePageFromSkip:', error);
        return 1;
    }
};

const buildQueryParams = (params) => {
    const queryParams = [];

    // Filtrer les années si elles existent
    if (params.year) {
        const [startYear, endYear] = params.year.split('-');
        if (startYear && endYear) {
            queryParams.push(`primary_release_date.gte=${startYear}-01-01`);
            queryParams.push(`primary_release_date.lte=${endYear}-12-31`);
        }
    }

    // Filtrer les évaluations si elles existent
    if (params.rating) {
        const [minRating, maxRating] = params.rating.split('-');
        if (minRating && maxRating) {
            queryParams.push(`vote_average.gte=${minRating}`);
            queryParams.push(`vote_average.lte=${maxRating}`);
        }
    }

    // Ajouter les autres paramètres sauf ceux qui ne doivent pas être inclus
    for (const [key, value] of Object.entries(params)) {
        if (
            value !== undefined && 
            value !== null && 
            !['year', 'rating', 'hideNoPoster', 'skip', 'genre'].includes(key)
        ) {
            queryParams.push(`${encodeURIComponent(key)}=${encodeURIComponent(value)}`);
        }
    }

    return queryParams.join('&');
};

const fetchData = async (type, id, extra, cacheDuration = '3d', tmdbApiKey = TMDB_API_KEY) => {
    try {
        const mediaType = type === 'series' ? 'tv' : type; 
        const language = extra.language || 'default';
        const cacheKey = `catalog_${mediaType}_${id}_${JSON.stringify(extra)}_lang_${language}`;

        log.info(`Generated cacheKey: ${cacheKey}`);

        const cachedData = await getCache(cacheKey, cacheDuration);
        if (cachedData) {
            log.info(`Returning cached data for key: ${cacheKey}`);
            return cachedData.value;
        }

        const skip = extra.skip || 0;
        const page = await determinePageFromSkip(skip, cacheDb);
        const queryParams = buildQueryParams({ ...extra, page });
        const url = `${TMDB_BASE_URL}/discover/${mediaType}?api_key=${tmdbApiKey}&${queryParams}`;
        log.info(`Fetching data from TMDB: ${url}`);

        return new Promise((resolve, reject) => {
            queue.push({
                fn: () => axios.get(url).then(async response => {
                    const results = response.data.results;
                    log.info(`Received ${results.length} results from TMDB for type: ${mediaType}`);

                    // Map to fetch genre names
                    const metas = await Promise.all(results.map(async item => {
                        let genreNames = [];
                        if (item.genre_ids && item.genre_ids.length > 0) {
                            genreNames = await getGenreNames(item.genre_ids, mediaType, language);
                        } else {
                            log.warn(`No genre IDs found for item ${item.id}`);
                        }
                        return {
                            id: item.id.toString(),
                            name: item.title || item.name,
                            poster: item.poster_path ? `https://image.tmdb.org/t/p/w600_and_h900_bestv2${item.poster_path}` : null,
                            banner: item.backdrop_path ? `https://image.tmdb.org/t/p/original${item.backdrop_path}` : null,
                            type: mediaType,
                            description: item.overview,
                            releaseInfo: item.release_date || item.first_air_date,
                            imdbRating: item.vote_average ? item.vote_average.toFixed(1) : null,
                            genres: genreNames
                        };
                    }));

                    setCache(cacheKey, metas, cacheDuration, page, skip);
                    resolve(metas);
                }).catch(error => {
                    log.error(`Error fetching data from TMDB: ${error.message}`);
                    reject(new Error('Failed to fetch data from TMDB'));
                })
            });
        });
    } catch (error) {
        log.error(`Error in fetchData function: ${error.message}`);
        throw error;
    }
};

// Function to get genre names from the database
const getGenreNames = (genreIds, mediaType, language) => {
    return new Promise((resolve, reject) => {
        if (!genreIds || genreIds.length === 0) {
            log.warn(`No genre IDs provided for mediaType: ${mediaType}`);
            return resolve([]);
        }

        const placeholders = genreIds.map(() => '?').join(',');
        const sql = `SELECT genre_name FROM genres WHERE genre_id IN (${placeholders}) AND media_type = ? AND language = ?`;

        genresDb.all(sql, [...genreIds, mediaType, language], (err, rows) => {
            if (err) {
                log.error('Error fetching genre names from database:', err);
                resolve([]); // Instead of rejecting, resolve with an empty array to avoid breaking fetchData
            } else {
                const genreNames = rows.map(row => row.genre_name);
                resolve(genreNames);
            }
        });
    });
};


const fetchGenres = async (type, language, tmdbApiKey = TMDB_API_KEY) => {
    const mediaType = type === 'series' ? 'tv' : 'movie';
    const endpoint = `/genre/${mediaType}/list`;

    try {
        const response = await axios.get(`${TMDB_BASE_URL}${endpoint}`, {
            params: {
                api_key: tmdbApiKey, // Utilisation de la clé API fournie ou par défaut
                language: language // Inclure la langue dans les paramètres
            }
        });
        log.debug(`Genres retrieved for type ${type} and language ${language}`);
        return response.data.genres;
    } catch (error) {
        log.error(`Error fetching genres from TMDB: ${error.message}`);
        throw error;
    }
};

const storeGenresInDb = (genres, mediaType, language) => {
    return new Promise((resolve, reject) => {
        genresDb.serialize(() => {
            genresDb.run('BEGIN TRANSACTION');

            const insertGenre = genresDb.prepare(`
                INSERT INTO genres (genre_id, genre_name, media_type, language)
                VALUES (?, ?, ?, ?)
                ON CONFLICT DO NOTHING; -- Utilisation de la clause générique ON CONFLICT
            `);

            let genresProcessed = 0;

            genres.forEach((genre) => {
                insertGenre.run(genre.id, genre.name, mediaType, language, (err) => {
                    if (err) {
                        log.error(`Error inserting genre: ${err.message}`);
                        genresDb.run('ROLLBACK');
                        reject(err);
                        return;
                    }

                    genresProcessed++;
                    if (genresProcessed === genres.length) {
                        insertGenre.finalize();
                        genresDb.run('COMMIT');
                        log.info(`Genres stored for ${mediaType} in language ${language}`);
                        resolve();
                    }
                });
            });
        });
    });
};

const checkGenresExistForLanguage = async (language) => {
    return new Promise((resolve, reject) => {
        log.debug(`Checking if genres exist for language: ${language}`);
        genresDb.get(
            `SELECT 1 FROM genres WHERE language = ? LIMIT 1`,
            [language], 
            (err, row) => {
                if (err) {
                    log.error(`Error checking genres existence for language ${language}: ${err.message}`);
                    reject(err);
                } else {
                    log.debug(`Genres existence check result for language ${language}: ${!!row}`);
                    resolve(!!row); // Retourne true si les genres existent
                }
            }
        );
    });
};

// Fonction pour récupérer et stocker les genres pour une langue donnée
const fetchAndStoreGenres = async (language, tmdbApiKey = TMDB_API_KEY) => {
    try {
        // Utilisation de la clé API fournie ou de la clé par défaut
        const movieGenres = await fetchGenres('movie', language, tmdbApiKey);
        const tvGenres = await fetchGenres('series', language, tmdbApiKey);

        await storeGenresInDb(movieGenres, 'movie', language);
        await storeGenresInDb(tvGenres, 'tv', language);

        log.info(`Genres fetched and stored for language ${language}.`);
    } catch (error) {
        log.error(`Error during fetching and storing genres: ${error.message}`);
    }
};

module.exports = { fetchData, getGenreId, checkGenresExistForLanguage, fetchAndStoreGenres };

