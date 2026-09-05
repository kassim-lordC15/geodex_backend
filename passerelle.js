const { SerialPort } = require('serialport');
const { ReadlineParser } = require('@serialport/parser-readline');
const axios = require('axios');

// === CONFIGURATION ===
// Remplacez 'COM3' par le port réel de votre Arduino (ex: COM4 sur Windows, /dev/ttyUSB0 sur Linux/Mac)
const PORT_SERIE = 'COM3'; 
const API_URL = 'http://localhost:3000/api/pesees';

console.log(` Tentative de connexion à l'Arduino sur ${PORT_SERIE}...`);

// Ouverture du port série
const port = new SerialPort({ path: PORT_SERIE, baudRate: 9600 });
const parser = port.pipe(new ReadlineParser({ delimiter: '\n' }));

port.on('open', () => {
    console.log(' Connecté à l\'Arduino ! En attente du scan RFID et de la pesée...');
});

// Écoute des messages venant de l'Arduino
parser.on('data', async (data) => {
    const texte = data.trim();
    
    // Si la ligne commence par notre mot-clé secret, c'est une donnée de pesée !
    if (texte.startsWith('JSON_PAYLOAD:')) {
        const jsonString = texte.replace('JSON_PAYLOAD:', '');
        
        try {
            const payload = JSON.parse(jsonString);
            console.log('\n [Passerelle] Pesée validée par l\'Arduino ! Envoi au serveur...');
            console.log(payload);

            // Envoi de la requête HTTP POST à votre backend
            const response = await axios.post(API_URL, payload);
            console.log(' [Serveur Réponse] :', response.data);

        } catch (error) {
            console.error(' [Erreur] Échec de la transmission à l\'API :', error.message);
        }
    } else {
        // Optionnel : afficher les autres messages (ex: initialisation)
        // console.log(`[Arduino Log] ${texte}`);
    }
});

port.on('error', (err) => {
    console.error(' Erreur du Port Série :', err.message);
});