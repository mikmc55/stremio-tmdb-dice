const axios = require('axios');
const log = require('./logger');
const { genresDb, cacheDb } = require('./db');
const { getCache, setCache } = require('./cache'); // Importer les fonctions de gestion du cache
const queue = require('./queue');  // Importer la file d'attente

// Clé API TMDB - Assurez-vous de l'avoir configurée dans les variables d'environnement
const TMDB_API_KEY = process.env.TMDB_API_KEY;
const TMDB_BASE_URL = 'https://api.themoviedb.org/3';

// Fonction pour obtenir l'ID du genre depuis la base de données
const getGenreId = (type, genreName) => {
    return new Promise((resolve, reject) => {
        const query = `SELECT genre_id FROM genres WHERE media_type = ? AND genre_name = ?`;

        genresDb.get(query, [type, genreName], (err, row) => {
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

// Fonction pour construire les paramètres de la requête
const buildQueryParams = (params) => {
    const queryParams = [];

    // Ajout des paramètres de date si spécifiés
    if (params.year) {
        const [startYear, endYear] = params.year.split('-');
        if (startYear && endYear) {
            queryParams.push(`primary_release_date.gte=${startYear}-01-01`);
            queryParams.push(`primary_release_date.lte=${endYear}-12-31`);
        }
    }

    // Ajout des paramètres de note si spécifiés
    if (params.rating) {
        const [minRating, maxRating] = params.rating.split('-');
        if (minRating && maxRating) {
            queryParams.push(`vote_average.gte=${minRating}`);
            queryParams.push(`vote_average.lte=${maxRating}`);
        }
    }

    // Ajout des autres paramètres
    for (const [key, value] of Object.entries(params)) {
        if (value !== undefined && value !== null && key !== 'year' && key !== 'rating') {
            queryParams.push(`${encodeURIComponent(key)}=${encodeURIComponent(value)}`);
        }
    }

    return queryParams.join('&');
};

const fetchData = async (type, id, extra) => {
    try {
        // Génération de la clé de cache
        const cacheKey = `catalog_${type}_${id}_${JSON.stringify(extra)}`;

        // Vérification du cache
        const cachedData = await getCache(cacheKey, '3d'); // Exemple avec une durée de cache de 3 jours
        if (cachedData) {
            log.info(`Returning cached data for key: ${cacheKey}`);
            return cachedData.value;
        }

        // Détermination de la page en fonction du skip
        const skip = extra.skip || 0;
        const page = await determinePageFromSkip(skip, cacheDb);

        // Construction des paramètres de la requête
        const queryParams = buildQueryParams({ ...extra, page });

        // URL de la requête TMDB
        const url = `${TMDB_BASE_URL}/discover/${type}?api_key=${TMDB_API_KEY}&${queryParams}`;
        log.info(`Fetching data from TMDB: ${url}`);

        // Utilisation de la file d'attente pour la requête TMDB
        return new Promise((resolve, reject) => {
            queue.push({
                fn: () => axios.get(url).then(response => {
                    const results = response.data.results;

                    // Logs pour les résultats obtenus
                    log.info(`Received ${results.length} results from TMDB for type: ${type}`);

                    // Traite les résultats pour renvoyer un tableau d'objets Meta
                    const metas = results.map(item => ({
                        id: item.id.toString(),
                        name: item.title || item.name,
                        poster: item.poster_path ? `https://image.tmdb.org/t/p/w600_and_h900_bestv2${item.poster_path}` : null,
                        banner: item.backdrop_path ? `https://image.tmdb.org/t/p/original${item.backdrop_path}` : null,
                        type: type,
                        description: item.overview,
                        releaseInfo: item.release_date || item.first_air_date,
                        imdbRating: item.vote_average ? item.vote_average.toFixed(1) : null,
                        genre: item.genre_ids
                    }));

                    // Mettre en cache les résultats
                    setCache(cacheKey, metas, '3d', page, skip);

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

// Fonction pour récupérer les genres depuis l'API TMDB
const fetchGenres = async (type) => {
    const mediaType = type === 'series' ? 'tv' : 'movie';
    const endpoint = `/genre/${mediaType}/list`;

    try {
        const response = await axios.get(`${TMDB_BASE_URL}${endpoint}`, {
            params: {
                api_key: TMDB_API_KEY
            }
        });
        log.debug(`Genres retrieved for type ${type}`);
        return response.data.genres;
    } catch (error) {
        log.error(`Error fetching genres from TMDB: ${error.message}`);
        throw error;
    }
};

// Fonction pour mettre à jour les genres dans la base de données
const updateGenres = async () => {
    try {
        const movieGenres = await fetchGenres('movie');
        const tvGenres = await fetchGenres('series');

        // Création d'une fonction pour insérer ou remplacer les genres
        const insertOrReplaceGenre = genresDb.prepare(`
            INSERT OR REPLACE INTO genres (genre_id, genre_name, media_type)
            VALUES (?, ?, ?);
        `);

        // Insertion ou mise à jour des genres pour les films
        movieGenres.forEach(genre => {
            insertOrReplaceGenre.run(genre.id, genre.name, 'movie');
        });

        // Insertion ou mise à jour des genres pour les séries
        tvGenres.forEach(genre => {
            insertOrReplaceGenre.run(genre.id, genre.name, 'tv');
        });

        insertOrReplaceGenre.finalize();
        log.info('Genres update completed.');
    } catch (error) {
        log.error(`Error during genres update: ${error.message}`);
    }
};

// Planification des mises à jour des genres toutes les 72 heures
const scheduleGenreUpdates = () => {
    log.info('Scheduling genre updates every 72 hours.');
    setInterval(async () => {
        log.info('Starting genre update...');
        await updateGenres();
    }, 3 * 24 * 60 * 60 * 1000); // Toutes les 72 heures
};

// Initialisation du processus d'update des genres
(async () => {
    try {
        log.info('Initializing genre updates.');
        await updateGenres();
        scheduleGenreUpdates();
    } catch (error) {
        log.error(`Initialization error: ${error.message}`);
    }
})();

module.exports = { fetchData, getGenreId };

