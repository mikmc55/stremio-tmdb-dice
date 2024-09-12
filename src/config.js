const { genresDb } = require('./db');

const getCurrentYear = () => new Date().getFullYear();

const generateYearIntervals = (startYear = 1880, endYear = getCurrentYear(), interval = 4) => {
    const intervals = [];
    endYear = Math.max(endYear, startYear);

    for (let year = endYear; year >= startYear; year -= interval) {
        const nextYear = Math.max(year - interval + 1, startYear);
        intervals.push(`${nextYear}-${year}`);
    }

    const [firstStart, firstEnd] = intervals.length 
        ? intervals[intervals.length - 1].split('-').map(Number) 
        : [startYear, endYear];

    if (firstStart > startYear) {
        intervals[intervals.length - 1] = `${startYear}-${firstEnd}`;
    }

    return intervals.length ? intervals : [`${startYear}-${endYear}`];
};

const getGenres = (type, language) => 
    new Promise((resolve, reject) => {
        const query = `SELECT genre_name FROM genres WHERE media_type = ? AND language = ?`;
        genresDb.all(query, [type, language], (err, rows) => {
            if (err) return reject(err);
            resolve(rows.map(row => row.genre_name));
        });
    });

const generateManifest = async (language) => {
    try {
        const [movieGenres, seriesGenres] = await Promise.all([
            getGenres('movie', language),
            getGenres('tv', language)
        ]);

        const yearIntervals = generateYearIntervals();

        return {
            id: 'community.stremiotmdbdice',
            version: '1.0.0',
            logo: "https://i.imgur.com/jEPaX6R.png",
            name: 'stremio-tmdb-dice',
            description: 'Random content from TMDB',
            types: ['movie', 'series'],
            idPrefixes: ['tt'],
            resources: ['catalog'],
            catalogs: [
                {
                    type: "movie",
                    id: "random_movies",
                    name: "Random Movies",
                    extra: [
                        { name: "genre", options: movieGenres.length ? movieGenres : ["No genres available"], isRequired: false },
                        { name: "rating", options: ["8-10", "6-8", "4-6", "2-4", "0-2"], isRequired: true },
                        { name: "year", options: yearIntervals, isRequired: true },
                        { name: 'skip', isRequired: false },
                    ]
                },
                {
                    type: "series",
                    id: "random_series",
                    name: "Random Series",
                    extra: [
                        { name: "genre", options: seriesGenres.length ? seriesGenres : ["No genres available"], isRequired: false },
                        { name: "rating", options: ["8-10", "6-8", "4-6", "2-4", "0-2"], isRequired: true },
                        { name: "year", options: yearIntervals, isRequired: true },
                        { name: 'skip', isRequired: false },
                    ]
                }
            ],
            behaviorHints: {
                configurable: true,
                configurationRequired: false,
            },
            config: [
                {
                    key: 'tmdbApiKey',
                    type: 'text',
                    title: 'TMDB API Key (<a href="https://www.themoviedb.org/settings/api" target="_blank">Get it here</a>)',
                },
                {
                    key: 'language',
                    type: 'text',
                    title: 'Language',
                }
            ]
        };
    } catch (error) {
        console.error('Error generating manifest:', error);
    }
};

module.exports = generateManifest;
