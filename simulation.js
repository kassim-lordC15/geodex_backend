const axios = require('axios');

// Configuration de l'endpoint de l'API locale développée
const API_URL = 'http://localhost:3000/api/pesees';

// Données fixes de simulation pour le hackathon
const CAPTEUR_ID = 'b989ad1c-f405-4253-8458-d3035184308e'; // UUID d'un capteur valide en BDD
const SIGNATURE_EQUIPEMENT = 'SECURE_HARDWARE_SIGN_METER_01';

// Générateur automatique de coordonnées (Simule un trajet autour d'une zone minière)
function genererPeseeAleatoire(modeFraude = false) {
    // Coordonnées de base (Ex: Proche de la mine de Séguéla en Côte d'Ivoire)
    let latitude = 7.9611;
    let longitude = -6.6722;

    if (modeFraude) {
        // Décale volontairement le camion loin de sa concession pour déclencher l'IA géospatiale
        latitude += 0.5; 
        longitude -= 0.5;
    } else {
        // Micro-variations normales de positionnement sur la zone légale
        latitude += (Math.random() - 0.5) * 0.001;
        longitude += (Math.random() - 0.5) * 0.001;
    }

    // Poids réaliste d'un camion minier chargé (entre 35 000 et 60 000 kg)
    const poids_mesure_kg = Math.floor(Math.random() * (60000 - 35000) + 35000);

    return {
        capteur_id: CAPTEUR_ID,
        poids_mesure_kg,
        latitude,
        longitude,
        signature_equipement: SIGNATURE_EQUIPEMENT
    };
}

// Fonction d'envoi automatique au serveur de contrôle
async function envoyerPeseeFictive(modeFraude = false) {
    const payload = genererPeseeAleatoire(modeFraude);
    
    console.log(`\n🚚 [Simulateur] Envoi d'une pesée (${modeFraude ? '🚨 Mode Tricherie' : '✅ Mode Conforme'})...`);
    
    try {
        const response = await axios.post(API_URL, payload);
        console.log(`📡 [Serveur Réponse]:`, response.data);
    } catch (error) {
        console.error(`[Erreur Réseau]: Impossible de joindre l'API Node.js.`, error.message);
    }
}

// --- CYCLE DE SIMULATION ---
console.log("⚡ Démarrage du simulateur de trafic minier.");

// Étape 1 : On envoie 2 camions normaux à la suite
setTimeout(() => envoyerPeseeFictive(false), 1000);
setTimeout(() => envoyerPeseeFictive(false), 4000);

// Étape 2 : Un camion pirate tente d'enregistrer une charge hors-concession
setTimeout(() => envoyerPeseeFictive(true), 8000);



