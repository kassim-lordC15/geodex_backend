const express = require('express');
const cors = require('cors');
require('dotenv').config();

const peseeRoutes = require('./routes/peseeRoutes');
const authRoutes = require('./routes/authRoutes');

const app = express();

// Middlewares
app.use(express.json());
app.use(cors());

// Definition des routes API
app.use('/api/auth', authRoutes);
app.use('/api/pesees', peseeRoutes);

// Route de vérification de l'état du serveur
app.get('/', (req, res) => {
    res.json({ message: 'API GEODEX opérationnelle' });
});

// Lancement du serveur
const PORT = process.env.PORT || 3000;
app.listen(PORT, '0.0.0.0', () => {
    console.log(` Serveur GEODEX démarré sur http://localhost:${PORT}`);
});