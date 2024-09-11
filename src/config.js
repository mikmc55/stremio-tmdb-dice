const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const { genresDb } = require('./db');

const getCurrentYear = () => new Date().getFullYear();

const generateYearIntervals = (startYear = 1880, endYear = getCurrentYear(), interval = 4) => {
    const intervals = [];
    
    // Corriger l'année de fin pour éviter les problèmes avec un intervalle unique
    endYear = Math.max(endYear, startYear);
    
    for (let year = startYear; year < endYear; year += interval) {
        const nextYear = Math.min(year + interval - 1, endYear);
        intervals.push(`${year}-${nextYear}`);
    }
    
    // Ajuster le dernier intervalle pour inclure jusqu'à endYear
    if (intervals.length > 0) {
        const lastInterval = intervals[intervals.length - 1];
        const [lastStart, lastEnd] = lastInterval.split('-').map(Number);
    
        if (lastEnd < endYear) {
            intervals[intervals.length - 1] = `${lastStart}-${endYear}`;
        }
    } else {
        // Si aucun intervalle n'a été ajouté, ajouter un intervalle unique pour toute la période
        intervals.push(`${startYear}-${endYear}`);
    }

    return intervals;
};

function getGenres(type) {
    return new Promise((resolve, reject) => {
        const query = `SELECT genre_name FROM genres WHERE media_type = ?`;
        genresDb.all(query, [type], (err, rows) => {
            if (err) {
                reject(err);
            } else {
                const genres = rows.map(row => row.genre_name);
                resolve(genres);
            }
        });
    });
}

// Fonction pour générer le manifeste
async function generateManifest() {
    try {
        // Utilisation des bons types pour récupérer les genres
        const movieGenres = await getGenres('movie');
        const seriesGenres = await getGenres('tv');

        // Génération dynamique des intervalles d'années
        const yearIntervals = generateYearIntervals();

        // Assurez-vous que les genres sont définis comme des tableaux
        const manifest = {
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
                        { name: "rating", options: ["0-2", "2-4", "4-6", "6-8", "8-10"], isRequired: true },
                        { name: "year", options: yearIntervals, isRequired: true }, // Utilisation des intervalles d'années dynamiques
                        { name: 'skip', isRequired: false },
                    ]
                },
                {
                    type: "series",
                    id: "random_series",
                    name: "Random Series",
                    extra: [
                        { name: "genre", options: seriesGenres.length ? seriesGenres : ["No genres available"], isRequired: false },
                        { name: "rating", options: ["0-2", "2-4", "4-6", "6-8", "8-10"], isRequired: true },
                        { name: "year", options: yearIntervals, isRequired: true }, // Utilisation des intervalles d'années dynamiques
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

        return manifest;

    } catch (error) {
        console.error('Error generating manifest:', error);
    }
}

// Exportation du manifeste
module.exports = generateManifest;
