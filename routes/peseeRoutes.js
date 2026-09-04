const express = require('express');
const router = express.Router();
const peseeController = require('../controllers/peseeController');

router.post('/', peseeController.enregistrerPesee);
router.get('/', peseeController.getPesees);
router.get('/alertes', peseeController.getAlertes);
router.get('/verify-chain', peseeController.verifierIntegrite);
router.get('/concessions', peseeController.getConcessions);

// [DEV ONLY] Falsification pour démo
router.post('/pesees/dev/falsifier', peseeController.devFalsifierBloc);
router.post('/pesees/dev/reset-chaine', peseeController.devResetChaine);

// Routes borne (nouvelles)
router.post('/bornes/rfid-scan',    peseeController.rfidScan);
router.get('/bornes/poids',         peseeController.getPoidsSimule);
router.post('/bornes/poids',        peseeController.setPoidsBrut);
router.post('/bornes/demo/pesee',   peseeController.demarrerPeseeDemo);
router.get('/bornes/etat',          peseeController.getEtatMateriel);
router.post('/bornes/etat',         peseeController.setEtatMateriel);
router.post('/passports/generate',  peseeController.genererPasseport);
router.post('/passports/verify',    peseeController.verifierPasseport);
router.post('/passports/print',     peseeController.imprimerTicket);
router.patch('/bornes/permis/:permisId/revoquer', peseeController.revoquerPermis);
router.get('/bornes/activite',      peseeController.getActiviteBornes);

module.exports = router;
