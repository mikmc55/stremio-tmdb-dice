const axios = require('axios');
const log = require('./logger');
const { genresDb, cacheDb } = require('./db');
const { getCache, setCache } = require('./cache');
const queue = require('./ratelimit');

const TMDB_API_KEY = process.env.TMDB_API_KEY;
const TMDB_BASE_URL = 'https://api.themoviedb.org/3';

const getGenreId = (mediaType, genreName) => 
    new Promise((resolve, reject) => {
        const query = `SELECT genre_id FROM genres WHERE media_type = ? AND genre_name = ?`;
        genresDb.get(query, [mediaType, genreName], (err, row) => {
            if (err) return reject(err);
            resolve(row ? row.genre_id : null);
        });
    });

const buildQueryParams = (params) => {
    const queryParams = [];

    if (params.year) {
        const [startYear, endYear] = params.year.split('-');
        if (startYear && endYear) {
            queryParams.push(`primary_release_date.gte=${startYear}-01-01`);
            queryParams.push(`primary_release_date.lte=${endYear}-12-31`);
        }
    }

    if (params.rating) {
        const [minRating, maxRating] = params.rating.split('-');
        if (minRating && maxRating) {
            queryParams.push(`vote_average.gte=${minRating}`);
            queryParams.push(`vote_average.lte=${maxRating}`);
        }
    }

    if (params.sort_by) {
        queryParams.push(`sort_by=${params.sort_by}`);
    }

    Object.entries(params).forEach(([key, value]) => {
        if (value !== undefined && value !== null && !['year', 'rating', 'hideNoPoster', 'skip', 'genre', 'sort_by'].includes(key)) {
            queryParams.push(`${encodeURIComponent(key)}=${encodeURIComponent(value)}`);
        }
    });

    return queryParams.join('&');
};

const convertsort_by = (sort_by) => {
    const sort_byOptions = {
        'Popularity': 'popularity.desc',
        'Revenue': 'revenue.desc',
        'Primary Release Date': 'primary_release_date.desc',
        'Vote Count': 'vote_count.desc',
        'First Air Date': 'first_air_date.desc'
    };
    return sort_byOptions[sort_by] || 'popularity.desc';
};

const fetchData = async (type, id, extra, cacheDuration = '3d', tmdbApiKey = TMDB_API_KEY) => {
    try {
        const mediaType = type === 'series' ? 'tv' : type;
        const language = extra.language || 'default';
        const genre = extra.genre || null;
        const year = extra.year || null;
        const rating = extra.rating || null;
        const sort_by = extra.sort_by ? convertsort_by(extra.sort_by) : null;
        const skip = extra.skip || 0;

        const cacheKey = `catalog_${mediaType}_${id}_${JSON.stringify(extra)}_lang_${language}_genre_${genre}_year_${year}_rating_${rating}_sort_by_${sort_by}`;
        log.info(`Cache key generated: ${cacheKey}`);

        const cachedData = await getCache(cacheKey, cacheDuration);
        if (cachedData) {
            log.info(`Using cached data for key: ${cacheKey}`);
            return cachedData.value;
        }

        log.debug(`Skip value: ${skip}`);

        const initialQueryParams = buildQueryParams({ ...extra, page: 1, sort_by });
        const initialUrl = `${TMDB_BASE_URL}/discover/${mediaType}?api_key=${tmdbApiKey}&${initialQueryParams}`;
        log.info(`Fetching initial data from TMDB to get total_pages: ${initialUrl}`);

        const initialResponse = await axios.get(initialUrl);
        let total_pages = initialResponse.data.total_pages;
        log.debug(`Total pages available: ${total_pages}`);

        if (total_pages > 500) {
            total_pages = 500;
            log.info(`Capping total pages at 500`);
        }

        const fetchedPages = await getFetchedPages(genre, year, rating, mediaType, sort_by, cacheDb);
        log.debug(`Fetched pages: ${fetchedPages}`);

        let availablePages = Array.from({ length: total_pages }, (_, i) => i + 1).filter(page => !fetchedPages.includes(page));
        
        if (availablePages.length === 0) {
            log.warn(`All pages have been fetched for the current filters.`);
            return [];
        }

        const randomPage = availablePages[Math.floor(Math.random() * availablePages.length)];
        log.debug(`Random page selected: ${randomPage}`);

        const queryParams = buildQueryParams({ ...extra, page: randomPage, sort_by });
        const url = `${TMDB_BASE_URL}/discover/${mediaType}?api_key=${tmdbApiKey}&${queryParams}`;
        log.info(`Fetching from TMDB: ${url}`);

        return new Promise((resolve, reject) => {
            queue.push({
                fn: () => axios.get(url).then(async response => {
                    const results = response.data.results;
                    log.info(`Fetched ${results.length} results from TMDB on page ${randomPage}`);

                    const metas = await Promise.all(results.map(async item => {
                        const genreNames = item.genre_ids && item.genre_ids.length > 0 
                            ? await getGenreNames(item.genre_ids, mediaType, language)
                            : [];

                        if (item.genre_ids && item.genre_ids.length === 0) {
                            log.warn(`No genre IDs for item ${item.id}`);
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

                    log.debug(`Metas prepared for caching: ${JSON.stringify(metas.map(meta => ({ id: meta.id, name: meta.name })))}`);
                    setCache(cacheKey, metas, cacheDuration, randomPage, skip, genre, year, rating, mediaType, sort_by);
                    resolve(metas);
                }).catch(error => {
                    log.error(`TMDB fetch error: ${error.message}`);
                    reject(new Error('Failed to fetch data from TMDB'));
                })
            });
        });
    } catch (error) {
        log.error(`Error in fetchData: ${error.message}`);
        throw error;
    }
};

const getFetchedPages = (genre, year, rating, mediaType, sort_by, cacheDb) => {
    return new Promise((resolve, reject) => {
        const decodedGenre = decodeURIComponent(genre || 'undefined');
        const decodedYear = decodeURIComponent(year || 'undefined');
        const decodedRating = decodeURIComponent(rating || 'undefined');
        const decodedsort_by = decodeURIComponent(sort_by || 'undefined');

        cacheDb.all(
            `SELECT page FROM cache WHERE genre = ? AND year = ? AND rating = ? AND mediaType = ? AND sort_by = ?`,
            [decodedGenre, decodedYear, decodedRating, mediaType, decodedsort_by],
            (err, rows) => {
                if (err) {
                    log.error(`Error querying cache for fetched pages: ${err.message}`);
                    reject(err);
                } else {
                    const fetchedPages = rows.map(row => row.page);
                    resolve(fetchedPages);
                }
            }
        );
    });
};

const getGenreNames = (genreIds, mediaType, language) => 
    new Promise((resolve, reject) => {
        if (!genreIds || genreIds.length === 0) {
            log.warn(`No genre IDs provided for ${mediaType}`);
            return resolve([]);
        }

        const placeholders = genreIds.map(() => '?').join(',');
        const sql = `SELECT genre_name FROM genres WHERE genre_id IN (${placeholders}) AND media_type = ? AND language = ?`;

        genresDb.all(sql, [...genreIds, mediaType, language], (err, rows) => {
            if (err) {
                log.error(`Error fetching genre names from database: ${err.message}`);
                resolve([]);
            } else {
                resolve(rows.map(row => row.genre_name));
            }
        });
    });

const fetchGenres = async (type, language, tmdbApiKey = TMDB_API_KEY) => {
    const mediaType = type === 'series' ? 'tv' : 'movie';
    const endpoint = `/genre/${mediaType}/list`;

    try {
        const response = await axios.get(`${TMDB_BASE_URL}${endpoint}`, {
            params: { api_key: tmdbApiKey, language }
        });
        log.debug(`Genres retrieved for ${type} (${language})`);
        return response.data.genres;
    } catch (error) {
        log.error(`Error fetching genres from TMDB: ${error.message}`);
        throw error;
    }
};

const storeGenresInDb = (genres, mediaType, language) => 
    new Promise((resolve, reject) => {
        genresDb.serialize(() => {
            genresDb.run('BEGIN TRANSACTION');
            const insertGenre = genresDb.prepare(`
                INSERT INTO genres (genre_id, genre_name, media_type, language)
                VALUES (?, ?, ?, ?)
                ON CONFLICT DO NOTHING;
            `);

            genres.forEach((genre, index) => {
                insertGenre.run(genre.id, genre.name, mediaType, language, (err) => {
                    if (err) {
                        log.error(`Error inserting genre: ${err.message}`);
                        genresDb.run('ROLLBACK');
                        reject(err);
                        return;
                    }

                    if (index === genres.length - 1) {
                        insertGenre.finalize();
                        genresDb.run('COMMIT');
                        log.info(`Genres stored for ${mediaType} (${language})`);
                        resolve();
                    }
                });
            });
        });
    });

const checkGenresExistForLanguage = async (language) => 
    new Promise((resolve, reject) => {
        log.debug(`Checking genres for ${language}`);
        genresDb.get(
            `SELECT 1 FROM genres WHERE language = ? LIMIT 1`,
            [language], 
            (err, row) => err ? reject(err) : resolve(!!row)
        );
    });

const fetchAndStoreGenres = async (language, tmdbApiKey = TMDB_API_KEY) => {
    try {
        const movieGenres = await fetchGenres('movie', language, tmdbApiKey);
        const tvGenres = await fetchGenres('series', language, tmdbApiKey);

        await storeGenresInDb(movieGenres, 'movie', language);
        await storeGenresInDb(tvGenres, 'tv', language);

        log.info(`Genres fetched and stored for ${language}`);
    } catch (error) {
        log.error(`Error fetching/storing genres: ${error.message}`);
    }
};

module.exports = { fetchData, getGenreId, checkGenresExistForLanguage, fetchAndStoreGenres };
