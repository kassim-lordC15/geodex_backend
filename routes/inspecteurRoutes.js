const express = require('express');
const router = express.Router();
const inspecteur = require('../controllers/inspecteurController');

router.get('/operateurs', inspecteur.listOperateurs);
router.get('/:rfidUid/historique', inspecteur.getHistoriqueBorne);
router.get('/operateurs/:id', inspecteur.getOperateurById);
router.get('/operateurs/:id/rapport', inspecteur.getOperateurRapport);

module.exports = router;
