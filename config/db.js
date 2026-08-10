const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
    user: process.env.DB_USER,
    host: process.env.DB_HOST,
    database: process.env.DB_NAME,
    password: process.env.DB_PASSWORD,
    port: process.env.DB_PORT,
});

// Vérification de la connexion
pool.query('SELECT NOW()', (err, res) => {
    if (err) {
        console.error(' Erreur de connexion à PostgreSQL :', err.message);
    } else {
        console.log(` Connecté à PostgreSQL (${process.env.DB_NAME}) avec succès !`);
    }
});

module.exports = pool;