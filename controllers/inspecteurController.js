const db = require('../config/db');

function classifierOperateur(op) {
  // Pas de permis valide → non répertorié
  if (!op.permis_id || (op.permis_statut && op.permis_statut.toUpperCase() !== 'VALIDE') || !op.actif)
    return { type: 'non_repertorie', label: 'Non répertorié', couleur: '🔴' };

  const quota = parseFloat(op.quota_jour_kg || 0) * 1000; // en grammes
  if (quota <= 500 * 1000) // 500 kg -> 500000 g
    return { type: 'artisanal', label: 'Artisanal', couleur: '🟡' };
  if (quota <= 5000 * 1000)
    return { type: 'semi_industriel', label: 'Semi-industriel', couleur: '🟠' };
  return { type: 'industriel', label: 'Industriel', couleur: '🔵' };
}

exports.listOperateurs = async (req, res) => {
  try {
    const search = req.query.search ? `%${req.query.search.trim().toLowerCase()}%` : null;

    const rows = await db.query(`
      SELECT o.*, c.code_permis, c.statut AS permis_statut, e.nom_entreprise
      FROM operateurs_rfid o
      LEFT JOIN concessions c ON c.code_permis = o.permis_id
      LEFT JOIN entreprises e ON e.id = c.entreprise_id
      ORDER BY o.created_at DESC
    `);

    let ops = rows.rows.map(r => ({
      id: r.id,
      nom: r.nom,
      permis_id: r.permis_id,
      permis_statut: r.permis_statut,
      site_nom: r.site_nom,
      quota_jour_kg: parseFloat(r.quota_jour_kg || 0),
      quota_jour_consomme_kg: parseFloat(r.quota_jour_consomme_kg || 0),
      quota_mensuel_kg: parseFloat(r.quota_mensuel_kg || 0),
      quota_mensuel_consomme_kg: parseFloat(r.quota_mensuel_consomme_kg || 0),
      actif: r.actif,
      entreprise: r.nom_entreprise,
      rfid_uid: r.rfid_uid,
      classification: classifierOperateur(r)
    }));

    if (search) {
      ops = ops.filter(o => (
        (o.nom || '').toLowerCase().includes(req.query.search.toLowerCase()) ||
        (o.permis_id || '').toLowerCase().includes(req.query.search.toLowerCase()) ||
        (o.site_nom || '').toLowerCase().includes(req.query.search.toLowerCase())
      ));
    }

    if (req.query.type) {
      ops = ops.filter(o => o.classification.type === req.query.type);
    }

    // Stats summary
    const total = ops.length;
    const byType = ops.reduce((acc, o) => {
      acc[o.classification.type] = (acc[o.classification.type] || 0) + 1;
      return acc;
    }, {});

    res.json({ success: true, total, byType, data: ops });
  } catch (e) {
    console.error('inspecteur.listOperateurs error:', e.message);
    res.status(500).json({ success: false, error: e.message });
  }
};

exports.getOperateurById = async (req, res) => {
  const id = req.params.id;
  try {
    const opRes = await db.query(`
      SELECT o.*, c.code_permis, c.statut AS permis_statut, e.nom_entreprise
      FROM operateurs_rfid o
      LEFT JOIN concessions c ON c.code_permis = o.permis_id
      LEFT JOIN entreprises e ON e.id = c.entreprise_id
      WHERE o.id = $1
      LIMIT 1
    `, [id]);

    if (opRes.rows.length === 0) return res.status(404).json({ success: false, message: 'Operateur introuvable' });
    const op = opRes.rows[0];

    // Historique pesées liées au permis de l'opérateur
    const pesees = await db.query(`
      SELECT r.id, r.poids_mesure_kg, ST_X(r.coordonnees_gps::geometry) as longitude, ST_Y(r.coordonnees_gps::geometry) as latitude, r.date_releve
      FROM releves_pesee r
      JOIN capteurs_iot s ON r.capteur_id = s.id
      JOIN concessions c ON s.concession_id = c.id
      WHERE c.code_permis = $1
      ORDER BY r.date_releve DESC
      LIMIT 200
    `, [op.permis_id]);

    const alertes = await db.query(`
      SELECT id, type_anomalie, description_detaillee, date_alerte
      FROM alertes_fraude
      WHERE permis_numero = $1 OR LOWER(operateur_nom) = LOWER($2)
      ORDER BY date_alerte DESC
      LIMIT 200
    `, [op.permis_id, op.nom]);

    const profile = {
      id: op.id,
      nom: op.nom,
      permis_id: op.permis_id,
      permis_statut: op.permis_statut,
      site_nom: op.site_nom,
      quota_jour_kg: parseFloat(op.quota_jour_kg || 0),
      quota_jour_consomme_kg: parseFloat(op.quota_jour_consomme_kg || 0),
      quota_mensuel_kg: parseFloat(op.quota_mensuel_kg || 0),
      quota_mensuel_consomme_kg: parseFloat(op.quota_mensuel_consomme_kg || 0),
      actif: op.actif,
      entreprise: op.nom_entreprise,
      rfid_uid: op.rfid_uid,
      classification: classifierOperateur(op)
    };

    res.json({ success: true, profile, quotas: {
      journalier: { totalKg: profile.quota_jour_kg, consommeKg: profile.quota_jour_consomme_kg },
      mensuel: { totalKg: profile.quota_mensuel_kg, consommeKg: profile.quota_mensuel_consomme_kg }
    }, historique_pesees: pesees.rows, alertes: alertes.rows });

  } catch (e) {
    console.error('inspecteur.getOperateurById error:', e.message);
    res.status(500).json({ success: false, error: e.message });
  }
};

exports.getOperateurRapport = async (req, res) => {
  // Retourne les mêmes données mais formatées pour impression/PDF
  const id = req.params.id;
  try {
    const opRes = await db.query(`
      SELECT o.*, c.code_permis, c.statut AS permis_statut, e.nom_entreprise
      FROM operateurs_rfid o
      LEFT JOIN concessions c ON c.code_permis = o.permis_id
      LEFT JOIN entreprises e ON e.id = c.entreprise_id
      WHERE o.id = $1
      LIMIT 1
    `, [id]);
    if (opRes.rows.length === 0) return res.status(404).json({ success: false, message: 'Operateur introuvable' });
    const op = opRes.rows[0];

    const pesees = await db.query(`
      SELECT r.id, r.poids_mesure_kg, ST_X(r.coordonnees_gps::geometry) as longitude, ST_Y(r.coordonnees_gps::geometry) as latitude, r.date_releve
      FROM releves_pesee r
      JOIN capteurs_iot s ON r.capteur_id = s.id
      JOIN concessions c ON s.concession_id = c.id
      WHERE c.code_permis = $1
      ORDER BY r.date_releve DESC
      LIMIT 200
    `, [op.permis_id]);

    const alertes = await db.query(`
      SELECT id, type_anomalie, description_detaillee, date_alerte
      FROM alertes_fraude
      WHERE permis_numero = $1 OR LOWER(operateur_nom) = LOWER($2)
      ORDER BY date_alerte DESC
      LIMIT 200
    `, [op.permis_id, op.nom]);

    const rapport = {
      meta: { generated_at: new Date(), rapport_pour: op.nom },
      profil: {
        nom: op.nom,
        permis: op.permis_id,
        statut: op.permis_statut,
        entreprise: op.nom_entreprise,
        site: op.site_nom,
        classification: classifierOperateur(op)
      },
      quotas: {
        journalier: { totalKg: parseFloat(op.quota_jour_kg || 0), consommeKg: parseFloat(op.quota_jour_consomme_kg || 0) },
        mensuel: { totalKg: parseFloat(op.quota_mensuel_kg || 0), consommeKg: parseFloat(op.quota_mensuel_consomme_kg || 0) }
      },
      historique_pesees: pesees.rows,
      alertes: alertes.rows
    };

    res.json({ success: true, rapport });
  } catch (e) {
    console.error('inspecteur.getOperateurRapport error:', e.message);
    res.status(500).json({ success: false, error: e.message });
  }
};

exports.getHistoriqueBorne = async (req, res) => {
  const rfidUid = req.params.rfidUid;
  try {
    const rows = await db.query(
      `SELECT id, rfid_uid, operateur_nom, permis_numero, permis_id, site_nom,
              poids_net_kg, hors_zone, distance_zone_m, statut,
              passeport_id, signature, qr_payload, latitude, longitude, borne_id, date_cycle
       FROM pesees_borne
       WHERE rfid_uid = $1
       ORDER BY date_cycle DESC
       LIMIT 200`,
      [rfidUid]
    );

    res.json({ success: true, data: rows.rows });
  } catch (e) {
    console.error('inspecteur.getHistoriqueBorne error:', e.message);
    res.status(500).json({ success: false, error: e.message });
  }
};
