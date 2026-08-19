const express = require('express');
const router = express.Router();
const peseeController = require('../controllers/peseeController');

router.post('/', peseeController.enregistrerPesee);
router.get('/', peseeController.getPesees);
router.get('/alertes', peseeController.getAlertes);
router.get('/verify-chain', peseeController.verifierIntegrite);
router.get('/concessions', peseeController.getConcessions);

module.exports = router;