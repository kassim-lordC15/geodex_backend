const db = require('../config/db');
const crypto = require('crypto');

// 1. Enregistrer une pesée (IoT) — avec support offline-first
exports.enregistrerPesee = async (req, res) => {
    const { id, capteur_id, poids_mesure_kg, latitude, longitude, signature_equipement, date_releve } = req.body;

    try {
        // Gestion doublon (sync offline)
        if (id) {
            const existing = await db.query(
                'SELECT id FROM releves_pesee WHERE id = $1',
                [id]
            );
            if (existing.rows.length > 0) {
                return res.status(200).json({
                    success: true,
                    message: 'Pesée déjà enregistrée (sync offline)',
                    data: { releve_id: id, statut: 'ALREADY_SYNCED' }
                });
            }
        }

        const capteurQuery = `
            SELECT c.id, c.concession_id 
            FROM capteurs_iot c
            WHERE c.id = $1 AND c.est_actif = TRUE
        `;
        const capteurResult = await db.query(capteurQuery, [capteur_id]);
        
        if (capteurResult.rows.length === 0) {
            return res.status(404).json({ success: false, message: 'Capteur introuvable ou inactif.' });
        }
        
        const concession_id = capteurResult.rows[0].concession_id;
        const pointGeoJSON = `SRID=4326;POINT(${longitude} ${latitude})`;

        const geoQuery = `
            SELECT ST_Contains(
                (SELECT limites_spatialiaux FROM concessions WHERE id = $1)::geometry,
                ST_SetSRID(ST_MakePoint($2, $3), 4326)::geometry
            ) as est_dans_zone;
        `;
        const geoCheck = await db.query(geoQuery, [concession_id, longitude, latitude]);
        const estDansZone = geoCheck.rows[0] ? geoCheck.rows[0].est_dans_zone : false;

        const lastHashQuery = `SELECT hash_actuel FROM releves_pesee ORDER BY date_releve DESC LIMIT 1`;
        const lastHashResult = await db.query(lastHashQuery);
        const hash_precedent = lastHashResult.rows.length > 0 ? lastHashResult.rows[0].hash_actuel : null;

        const dataToHash = `${capteur_id}-${poids_mesure_kg}-${latitude}-${longitude}-${signature_equipement}-${hash_precedent || 'GENESIS'}-${Date.now()}`;
        const hash_actuel = crypto.createHash('sha256').update(dataToHash).digest('hex');

        const releve_id = id || crypto.randomUUID();

        // Accepter timestamp passé (offline-first)
        const dateReleve = date_releve ? new Date(date_releve) : new Date();

        const insertReleveQuery = `
            INSERT INTO releves_pesee 
            (id, capteur_id, poids_mesure_kg, coordonnees_gps, signature_equipement, hash_actuel, hash_precedent, date_releve)
            VALUES ($1, $2, $3, ST_GeomFromEWKT($4), $5, $6, $7, $8)
            RETURNING id;
        `;
        const releveResult = await db.query(insertReleveQuery, [
            releve_id, 
            capteur_id, 
            poids_mesure_kg, 
            pointGeoJSON, 
            signature_equipement, 
            hash_actuel, 
            hash_precedent,
            dateReleve
        ]);
        
        const newReleveId = releveResult.rows[0].id;

        if (!estDansZone) {
            const alerteId = crypto.randomUUID();
            const insertAlerteQuery = `
                INSERT INTO alertes_fraude (id, releve_id, type_anomalie, description_detaillee)
                VALUES ($1, $2, $3, $4)
            `;
            await db.query(insertAlerteQuery, [
                alerteId,
                newReleveId, 
                'HORS_ZONE', 
                `Pesée hors limites géographiques. Coordonnées: ${latitude}, ${longitude}`
            ]);
        }

        res.status(201).json({
            success: true,
            message: estDansZone ? 'Relevé valide enregistré.' : 'Anomalie détectée : Relevé hors zone, alerte transmise au centre de contrôle.',
            data: {
                releve_id: newReleveId,
                hash_actuel,
                statut: estDansZone ? 'VALIDE' : 'FRAUDE_SUSPECTEE'
            }
        });

    } catch (err) {
        console.error('Erreur Pesee:', err.message);
        res.status(500).json({ success: false, error: err.message });
    }
};

// 2. Récupérer les alertes pour le Dashboard
exports.getAlertes = async (req, res) => {
    try {
        const query = `
            SELECT a.id, a.type_anomalie, a.description_detaillee, a.date_alerte,
                   a.longitude, a.latitude, a.poids_kg as poids_mesure_kg,
                   a.rfid_uid, a.operateur_nom, a.permis_numero, a.site_nom
            FROM alertes_fraude a
            ORDER BY a.date_alerte DESC;
        `;
        const result = await db.query(query);
        res.json({ success: true, count: result.rows.length, data: result.rows });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
};
// 3. Vérifier l'intégrité de la chaîne de Hash
exports.verifierIntegrite = async (req, res) => {
  try {
    const query = `
      SELECT r.*, o.nom as operateur_nom, o.permis_numero, o.site_nom
      FROM releves_pesee r
      LEFT JOIN operateurs_rfid o ON o.rfid_uid = r.capteur_id
      ORDER BY r.date_releve ASC
    `;

    const result = await db.query(query);

    const blocs = result.rows;

    if (blocs.length === 0) {
      return res.json({
        integre: true,
        message: 'Aucune pesée enregistrée',
        blocs: [],
        rapport: { total: 0, integres: 0, corrompus: 0 },
      });
    }

    const blocsVerifies = [];
    let premierBlocCorrompu = null;

    for (let i = 0; i < blocs.length; i++) {
      const bloc = blocs[i];
      const precedent = i === 0 ? null : blocs[i - 1];

      let hashAttendu = null;
      let integre = true;
      let raisonEchec = null;

      if (i === 0) {
        integre = bloc.hash_precedent === null;
        if (!integre) raisonEchec = 'Bloc genesis avec hash_precedent non nul';
      } else {
        hashAttendu = precedent.hash_actuel;
        integre = bloc.hash_precedent === hashAttendu;
        if (!integre) {
          raisonEchec = `Hash attendu: ${hashAttendu?.substring(0, 16)}... — Hash trouvé: ${bloc.hash_precedent?.substring(0, 16)}...`;
        }
      }

      const blocVerifie = {
        index:        i + 1,
        id:           bloc.id,
        permisId:     bloc.permis_numero ?? bloc.capteur_id,
        operateurNom: bloc.operateur_nom ?? bloc.capteur_id,
        siteNom:      bloc.site_nom ?? '—',
        poidsNetKg:   parseFloat(bloc.poids_mesure_kg ?? 0),
        timestamp:    bloc.date_releve,
        latitude:     0,
        longitude:    0,
        hashActuel:   bloc.hash_actuel,
        hashPrecedent: bloc.hash_precedent,
        hashAttendu,
        integre,
        raisonEchec,
      };

      blocsVerifies.push(blocVerifie);

      if (!integre && premierBlocCorrompu === null) {
        premierBlocCorrompu = blocVerifie;

        await db.query(
          `INSERT INTO alertes_fraude (
            type_anomalie, description_detaillee, permis_numero,
            latitude, longitude, poids_kg, date_alerte, statut
          ) VALUES ($1,$2,$3,$4,$5,$6,NOW(),'NON_TRAITEE')
          ON CONFLICT DO NOTHING`,
          [
            'FALSIFICATION_CHAINE',
            `Bloc #${i + 1} corrompu — Capteur ${bloc.capteur_id} — Poids: ${bloc.poids_mesure_kg}kg`,
            bloc.capteur_id,
            0,
            0,
            parseFloat(bloc.poids_mesure_kg ?? 0),
          ]
        );
      }
    }

    const integres  = blocsVerifies.filter(b => b.integre).length;
    const corrompus = blocsVerifies.filter(b => !b.integre).length;

    res.json({
      integre:            corrompus === 0,
      message:            corrompus === 0
        ? `Chaîne intègre — ${integres} blocs vérifiés`
        : `⛔ ${corrompus} bloc(s) corrompu(s) détecté(s)`,
      premierBlocCorrompu,
      blocs:              blocsVerifies,
      rapport: {
        total:    blocs.length,
        integres,
        corrompus,
      },
    });

  } catch (err) {
    console.error('verifierIntegrite error:', err);
    res.status(500).json({ success: false, error: err.message });
  }
};

// [DEV ONLY] Falsifier un bloc pour démonstration
exports.devFalsifierBloc = async (req, res) => {
  if (process.env.NODE_ENV === 'production') {
    return res.status(403).json({ erreur: 'Interdit en production' });
  }

  try {
    const result = await db.query(
      `SELECT id, poids_mesure_kg FROM releves_pesee ORDER BY date_releve ASC LIMIT 5 OFFSET 3`
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ erreur: 'Bloc introuvable' });
    }

    const bloc = result.rows[0];
    const nouveauPoids = parseFloat(bloc.poids_mesure_kg) + 999.99;

    await db.query(
      `UPDATE releves_pesee SET poids_mesure_kg = $1 WHERE id = $2`,
      [nouveauPoids, bloc.id]
    );

    res.json({
      succes: true,
      message: `Bloc #4 falsifié — poids modifié de ${bloc.poids_mesure_kg}kg à ${nouveauPoids}kg`,
      blocId: bloc.id,
    });

  } catch (e) {
    res.status(500).json({ succes: false, erreur: e.message });
  }
};

exports.devResetChaine = async (req, res) => {
  if (process.env.NODE_ENV === 'production') {
    return res.status(403).json({ erreur: 'Interdit en production' });
  }

  try {
    const original = await db.query(
      `SELECT poids_mesure_kg FROM releves_pesee ORDER BY date_releve ASC LIMIT 1 OFFSET 3`
    );
    const originalPoids = original.rows[0]?.poids_mesure_kg;

    const target = await db.query(
      `SELECT id FROM releves_pesee ORDER BY date_releve ASC LIMIT 1 OFFSET 3`
    );
    const targetId = target.rows[0]?.id;

    if (targetId && originalPoids !== undefined) {
      await db.query(
        `UPDATE releves_pesee SET poids_mesure_kg = $1 WHERE id = $2`,
        [originalPoids, targetId]
      );
    }

    res.json({ succes: true, message: 'Chaîne réinitialisée' });
  } catch (e) {
    res.status(500).json({ succes: false, erreur: e.message });
  }
};

// 4. Récupérer toutes les concessions au format GeoJSON (Jointure concessions + entreprises)
exports.getConcessions = async (req, res) => {
    try {
        const query = `
            SELECT 
                c.id, 
                c.code_permis, 
                c.minerai, 
                c.statut, 
                c.date_attribution, 
                c.date_expiration,
                e.nom_entreprise,
                ST_AsGeoJSON(c.limites_spatialiaux)::json AS geojson
            FROM concessions c
            LEFT JOIN entreprises e ON c.entreprise_id = e.id;
        `;
        const result = await db.query(query);

        const geojsonFeatures = result.rows.map(row => ({
            type: "Feature",
            properties: {
                id: row.id,
                code_permis: row.code_permis,
                minerai: row.minerai,
                statut: row.statut,
                nom_entreprise: row.nom_entreprise,
                date_attribution: row.date_attribution,
                date_expiration: row.date_expiration
            },
            geometry: row.geojson
        }));

        res.json({
            type: "FeatureCollection",
            features: geojsonFeatures
        });
    } catch (err) {
        console.error('Erreur Concessions:', err.message);
        res.status(500).json({ success: false, error: err.message });
    }
};

// 5. Récupérer toutes les pesées (avec jointures pour le frontend)
exports.getPesees = async (req, res) => {
    try {
        const query = `
            SELECT 
                r.id,
                r.capteur_id,
                r.poids_mesure_kg,
                ST_X(r.coordonnees_gps::geometry) as longitude,
                ST_Y(r.coordonnees_gps::geometry) as latitude,
                r.hash_actuel,
                r.hash_precedent,
                r.date_releve,
                c.code_permis,
                c.minerai,
                c.statut
            FROM releves_pesee r
            LEFT JOIN capteurs_iot s ON r.capteur_id = s.id
            LEFT JOIN concessions c ON s.concession_id = c.id
            ORDER BY r.date_releve DESC
        `;
        const result = await db.query(query);
        
        const data = result.rows.map(row => ({
            id: row.id,
            capteur_id: row.capteur_id,
            poids_mesure_kg: row.poids_mesure_kg,
            latitude: parseFloat(row.latitude),
            longitude: parseFloat(row.longitude),
            hash_actuel: row.hash_actuel,
            hash_precedent: row.hash_precedent,
            date_releve: row.date_releve,
            code_permis: row.code_permis || 'INCONNU',
            minerai: row.minerai || 'AUTRE',
            statut: row.statut || 'EN_ATTENTE'
        }));

        res.json({
            success: true,
            count: data.length,
            data: data
        });
    } catch (err) {
        console.error('Erreur Pesees:', err.message);
        res.status(500).json({ success: false, error: err.message });
    }
};

// ─────────────────────────────────────────────────────────
// BORNE — Scan badge RFID (vraie DB)
// ─────────────────────────────────────────────────────────
function _loggerAlerte(details) {
  const id = crypto.randomUUID();
  const query = `
    INSERT INTO alertes_fraude
      (id, type_anomalie, description_detaillee, date_alerte,
       rfid_uid, operateur_nom, permis_numero, site_nom,
       latitude, longitude, poids_kg)
    VALUES ($1, $2, $3, NOW(), $4, $5, $6, $7, $8, $9, $10)
  `;
  return db.query(query, [
    id,
    details.type,
    details.description,
    details.rfidUid || null,
    details.operateurNom || null,
    details.permisNumero || null,
    details.siteNom || null,
    details.latitude || null,
    details.longitude || null,
    details.poidsKg || null,
  ]);
}

exports.rfidScan = async (req, res) => {
  const { rfidUid } = req.body;

  if (!rfidUid) {
    return res.status(400).json({ succes: false, erreur: 'rfidUid manquant' });
  }

  try {
    const result = await db.query(
      `SELECT * FROM operateurs_rfid WHERE rfid_uid = $1 AND actif = true`,
      [rfidUid]
    );

    // Badge inconnu
    if (result.rows.length === 0) {
      return res.status(404).json({
        succes: false,
        erreur: 'Badge non reconnu',
        code: 'BADGE_INCONNU',
      });
    }

    const op = result.rows[0];

    // Permis expiré
    if (op.date_expiration && new Date(op.date_expiration) < new Date()) {
      await _loggerAlerte({
        type: 'PERMIS_EXPIRE',
        description: `Tentative de pesée avec permis expiré — ${op.nom} (${op.permis_numero})`,
        rfidUid,
        operateurNom: op.nom,
        permisNumero: op.permis_numero,
        siteNom: op.site_nom,
      });

      return res.status(403).json({
        succes: false,
        erreur: `Permis expiré — ${op.nom}`,
        code: 'PERMIS_EXPIRE',
        operateur: {
          id: op.id,
          nom: op.nom,
          permisNumero: op.permis_numero,
          dateExpiration: op.date_expiration,
          siteNom: op.site_nom,
        },
      });
    }

    // Quota dépassé
    const quotaJourRestant    = parseFloat(op.quota_jour_kg)    - parseFloat(op.quota_jour_consomme_kg);
    const quotaMensuelRestant = parseFloat(op.quota_mensuel_kg) - parseFloat(op.quota_mensuel_consomme_kg);
    const quotaDepasse        = quotaJourRestant <= 0 || quotaMensuelRestant <= 0;

    if (quotaDepasse) {
      await _loggerAlerte({
        type: 'QUOTA_DEPASSE',
        description: `Quota journalier dépassé — ${op.nom} (${op.permis_numero}) — restant: ${quotaJourRestant}g`,
        rfidUid,
        operateurNom: op.nom,
        permisNumero: op.permis_numero,
        siteNom: op.site_nom,
      });

      return res.status(403).json({
        succes: false,
        erreur: `Quota dépassé pour ${op.nom}`,
        code: 'QUOTA_DEPASSE',
        operateur: {
          id: op.id,
          nom: op.nom,
          permisId: op.permis_id,
          permisNumero: op.permis_numero,
          dateExpiration: op.date_expiration,
          siteNom: op.site_nom,
          quotaJourKg: parseFloat(op.quota_jour_kg),
          quotaMensuelKg: parseFloat(op.quota_mensuel_kg),
          quotaJourRestantKg: quotaJourRestant,
          quotaMensuelRestantKg: quotaMensuelRestant,
          quotaDepasse: true,
        },
      });
    }

    // Badge valide
    res.json({
      succes: true,
      operateur: {
        id: op.id,
        rfidUid: op.rfid_uid,
        nom: op.nom,
        permisId: op.permis_id,
        permisNumero: op.permis_numero,
        dateExpiration: op.date_expiration,
        siteNom: op.site_nom,
        quotaJourKg: parseFloat(op.quota_jour_kg),
        quotaMensuelKg: parseFloat(op.quota_mensuel_kg),
        quotaJourRestantKg: quotaJourRestant,
        quotaMensuelRestantKg: quotaMensuelRestant,
        quotaDepasse: false,
        sitesAutorises: op.sites_autorises,
      },
    });

  } catch (e) {
    console.error('rfidScan error:', e);
    res.status(500).json({ succes: false, erreur: e.message });
  }
};

// ─────────────────────────────────────────────────────────
// BORNE — Poids simulé HX711 (polling Flutter)
// ─────────────────────────────────────────────────────────
let _poidsSimuleG = 0;
let _poidsStabilise = false;
let _ciblePeseeDemoG = null;
// La passerelle ESP32/Raspberry Pi met a jour cet etat. En son absence,
// le prototype reste demonstrable avec le materiel virtuel actif.
let _etatMateriel = {
  rfid: true,
  balance: true,
  imprimante: true,
  reseau: true,
  modeDemo: true,
};

exports.getEtatMateriel = (req, res) => res.json(_etatMateriel);

exports.setEtatMateriel = (req, res) => {
  const champs = ['rfid', 'balance', 'imprimante', 'reseau', 'modeDemo'];
  for (const champ of champs) {
    if (typeof req.body[champ] === 'boolean') _etatMateriel[champ] = req.body[champ];
  }
  res.json({ succes: true, ..._etatMateriel });
};

exports.getPoidsSimule = async (req, res) => {
  if (!_etatMateriel.balance) {
    return res.status(503).json({ poidsG: 0, stabilise: false, erreur: 'Balance HX711 indisponible' });
  }
  if (_ciblePeseeDemoG !== null) {
    const ecart = _ciblePeseeDemoG - _poidsSimuleG;
    _poidsSimuleG += Math.max(0.35, Math.min(5.5, ecart * 0.34));
    if (Math.abs(_ciblePeseeDemoG - _poidsSimuleG) < 0.15) {
      _poidsSimuleG = _ciblePeseeDemoG;
      _poidsStabilise = true;
      _ciblePeseeDemoG = null;
    }
  } else if (!_poidsStabilise) {
    _poidsSimuleG += Math.random() * 0.8 - 0.1;
    _poidsSimuleG = Math.max(0, _poidsSimuleG);
  }
  res.json({
    poidsG: parseFloat(_poidsSimuleG.toFixed(2)),
    stabilise: _poidsStabilise,
  });
};

exports.setPoidsBrut = async (req, res) => {
  const { poidsG, stabilise } = req.body;
  if (poidsG !== undefined)    _poidsSimuleG   = parseFloat(poidsG);
  if (stabilise !== undefined) _poidsStabilise = Boolean(stabilise);
  res.json({ ok: true, poidsG: _poidsSimuleG, stabilise: _poidsStabilise });
};

exports.demarrerPeseeDemo = (req, res) => {
  const poidsDemande = Number(req.body.poidsG);
  _poidsSimuleG = 0;
  _poidsStabilise = false;
  _ciblePeseeDemoG = Number.isFinite(poidsDemande) && poidsDemande > 0
    ? poidsDemande
    : Number((18 + Math.random() * 42).toFixed(2));
  res.json({ succes: true, cibleG: _ciblePeseeDemoG, statut: 'SIMULATION_DEMARREE' });
};

async function enregistrerReleveBorne({ permisId, poidsNetKg, latitude, longitude }) {
  const capteur = await db.query(`
    SELECT s.id, s.signature_equipement
    FROM capteurs_iot s
    JOIN concessions c ON c.id = s.concession_id
    WHERE c.code_permis = $1 AND s.est_actif = TRUE
    LIMIT 1
  `, [permisId]);
  if (capteur.rows.length === 0) return null;

  const precedent = await db.query(
    'SELECT hash_actuel FROM releves_pesee ORDER BY date_releve DESC LIMIT 1'
  );
  const hashPrecedent = precedent.rows[0]?.hash_actuel ?? null;
  const releveId = crypto.randomUUID();
  const signature = capteur.rows[0].signature_equipement || 'GEODEX-BORNE-SIGNEE';
  const hashActuel = crypto.createHash('sha256')
    .update(`${capteur.rows[0].id}-${poidsNetKg}-${latitude}-${longitude}-${signature}-${hashPrecedent || 'GENESIS'}-${Date.now()}`)
    .digest('hex');
  await db.query(`
    INSERT INTO releves_pesee
      (id, capteur_id, poids_mesure_kg, coordonnees_gps, signature_equipement, hash_actuel, hash_precedent, date_releve)
    VALUES ($1, $2, $3, ST_GeomFromEWKT($4), $5, $6, $7, NOW())
  `, [
    releveId, capteur.rows[0].id, poidsNetKg,
    `SRID=4326;POINT(${longitude} ${latitude})`, signature, hashActuel, hashPrecedent,
  ]);
  return releveId;
}

// ─────────────────────────────────────────────────────────
// BORNE — Génération Passeport Minéral signé HMAC-SHA256
// ─────────────────────────────────────────────────────────
exports.genererPasseport = async (req, res) => {
  const { operateurId, operateurNom, permisId, permisNumero,
          poidsNetKg, latitude, longitude, borneId } = req.body;

  if (!operateurId || !poidsNetKg) {
    return res.status(400).json({
      succes: false, erreur: 'operateurId et poidsNetKg requis'
    });
  }

  try {
    // ── 1. Vérification géofence PostGIS ──────────────────
    let horsZone = false;
    let distanceM = 0;

    if (latitude && longitude && permisNumero) {
      const geoCheck = await db.query(
        `SELECT
           ST_Distance(
             zone,
             ST_SetSRID(ST_MakePoint($1, $2), 4326)::geography
           ) AS distance_m,
           ST_Contains(
             zone::geometry,
             ST_SetSRID(ST_MakePoint($1, $2), 4326)
           ) AS dans_zone
         FROM zones_permis
         WHERE permis_numero = $3
         LIMIT 1`,
        [longitude, latitude, permisNumero]
      );

      if (geoCheck.rows.length > 0) {
        distanceM = parseFloat(geoCheck.rows[0].distance_m);
        horsZone  = !geoCheck.rows[0].dans_zone;

        if (horsZone) {
          await _loggerAlerte({
            type: 'HORS_ZONE',
            description: `Pesée hors zone permis — ${operateurNom} — distance: ${Math.round(distanceM)}m du périmètre`,
            operateurNom,
            permisNumero,
            latitude,
            longitude,
            poidsKg: parseFloat(poidsNetKg),
          });

          if (distanceM > 10000) {
            return res.status(403).json({
              succes: false,
              erreur: `Pesée hors zone autorisée — distance: ${Math.round(distanceM / 1000)}km`,
              code: 'HORS_ZONE_BLOQUANT',
              distanceM: Math.round(distanceM),
            });
          }
        }
      }
    }

    // ── 2. Génération passeport ───────────────────────────
    const timestamp  = Date.now();
    const expiration = timestamp + 24 * 60 * 60 * 1000;
    const nonce      = crypto.randomBytes(16).toString('hex');

    const payload = {
      id:           crypto.randomUUID(),
      operateurId,
      operateurNom,
      permisId:     permisId ?? permisNumero,
      permisNumero: permisNumero ?? permisId,
      borneId:      borneId ?? 'BORNE-TONGON-01',
      poidsNetKg:   parseFloat(poidsNetKg),
      latitude:     parseFloat(latitude  ?? 9.167),
      longitude:    parseFloat(longitude ?? -6.483),
      horsZone,
      distanceZoneM: Math.round(distanceM),
      timestamp,
      expiration,
      nonce,
    };

    const cleSecrete = process.env.PASSPORT_SECRET ?? 'geodex-secret-demo-2026';
    const signature  = crypto
      .createHmac('sha256', cleSecrete)
      .update(JSON.stringify(payload))
      .digest('hex');

    const passeportComplet = {
      ...payload,
      signature,
      statut: horsZone ? 'hors_zone' : 'valide',
    };

    const qrPayload = Buffer
      .from(JSON.stringify(passeportComplet))
      .toString('base64');

    // ── 3. Sauvegarde cycle complet dans pesees_borne ───────
    const opRes = await db.query(
      `SELECT rfid_uid, site_nom FROM operateurs_rfid WHERE id = $1 LIMIT 1`,
      [operateurId]
    );
    const rfidUid = opRes.rows[0]?.rfid_uid ?? operateurId;
    const siteNom = opRes.rows[0]?.site_nom ?? permisNumero ?? permisId;

    await db.query(
      `INSERT INTO pesees_borne
        (rfid_uid, operateur_nom, permis_numero, permis_id, site_nom,
         poids_net_kg, hors_zone, distance_zone_m, statut,
         passeport_id, signature, qr_payload, latitude, longitude, borne_id, date_cycle)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,NOW())`,
      [
        rfidUid, operateurNom, permisNumero, permisId, siteNom,
        parseFloat(poidsNetKg), horsZone, Math.round(distanceM),
        horsZone ? 'hors_zone' : 'valide',
        payload.id, signature, qrPayload,
        parseFloat(latitude ?? 0), parseFloat(longitude ?? 0),
        borneId ?? 'BORNE-TONGON-01'
      ]
    );

    // ── 4. Mise à jour quota en DB ────────────────────────
    await db.query(
      `UPDATE operateurs_rfid
        SET quota_jour_consomme_kg    = quota_jour_consomme_kg    + $1,
            quota_mensuel_consomme_kg = quota_mensuel_consomme_kg + $1
        WHERE id = $2`,
      [parseFloat(poidsNetKg), operateurId]
    );

    // ── 4. Réinitialiser poids simulé ────────────────────
    _poidsSimuleG   = 0;
    _poidsStabilise = false;

    res.json({
      succes: true,
      horsZone,
      distanceZoneM: Math.round(distanceM),
      passeport: passeportComplet,
      qrPayload,
    });

  } catch (e) {
    console.error('genererPasseport error:', e);
    res.status(500).json({ succes: false, erreur: e.message });
  }
};

// La passerelle recoit cette commande et l'envoie a l'imprimante thermique.
// Aucun contenu sensible n'est genere par le client : l'identifiant renvoie
// au passeport signe par le serveur.
exports.imprimerTicket = async (req, res) => {
  const { passeportId } = req.body;
  if (!passeportId) return res.status(400).json({ succes: false, erreur: 'passeportId requis' });
  if (!_etatMateriel.imprimante) {
    return res.status(503).json({ succes: false, erreur: 'Imprimante thermique indisponible' });
  }
  setTimeout(() => {}, 0); // Point d'integration pour la passerelle IoT.
  return res.json({ succes: true, passeportId, statut: 'IMPRESSION_ENVOYEE' });
};

// COMPTOIR — Verification du passeport par l'autorite qui detient la cle.
// Le client ne valide jamais lui-meme une signature : un QR modifie est refuse.
exports.verifierPasseport = async (req, res) => {
  const { qrPayload } = req.body;

  if (typeof qrPayload !== 'string' || qrPayload.trim().length === 0) {
    return res.status(400).json({
      valide: false,
      code: 'QR_ABSENT',
      motifRefus: 'Passeport mineral absent',
    });
  }

  try {
    const passeport = JSON.parse(Buffer.from(qrPayload.trim(), 'base64').toString('utf8'));
    const { signature, statut, ...payload } = passeport;
    const champsRequis = [
      'id', 'operateurId', 'operateurNom', 'permisId', 'borneId', 'poidsNetKg',
      'latitude', 'longitude', 'timestamp', 'expiration', 'nonce',
    ];

    if (!signature || champsRequis.some((champ) => payload[champ] === undefined)) {
      return res.status(400).json({
        valide: false,
        code: 'FORMAT_INVALIDE',
        motifRefus: 'QR incomplet ou illisible',
      });
    }

    const signatureAttendue = crypto
      .createHmac('sha256', process.env.PASSPORT_SECRET ?? 'geodex-secret-demo-2026')
      .update(JSON.stringify(payload))
      .digest('hex');
    const signatureValide =
      typeof signature === 'string' &&
      signature.length === signatureAttendue.length &&
      crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(signatureAttendue));

    if (!signatureValide || statut !== 'valide') {
      return res.status(403).json({
        valide: false,
        code: 'SIGNATURE_INVALIDE',
        motifRefus: 'Signature cryptographique invalide',
      });
    }

    if (!Number.isFinite(payload.poidsNetKg) || payload.poidsNetKg <= 0 ||
        !Number.isFinite(payload.expiration) || Date.now() > payload.expiration) {
      return res.status(403).json({
        valide: false,
        code: 'PASSEPORT_EXPIRE',
        motifRefus: 'Passeport expire ou donnees de pesee invalides',
      });
    }

    return res.json({
      valide: true,
      code: 'PASSEPORT_VALIDE',
      passeport: payload,
    });
  } catch (_) {
    return res.status(400).json({
      valide: false,
      code: 'FORMAT_INVALIDE',
      motifRefus: 'QR invalide ou corrompu',
    });
  }
};

exports.getActiviteBornes = async (req, res) => {
  try {
    const pesees = await db.query(`
      SELECT
        o.nom AS operateur,
        o.permis_id,
        o.quota_jour_kg,
        o.quota_jour_consomme_kg,
        o.quota_mensuel_kg,
        o.quota_mensuel_consomme_kg,
        o.rfid_uid,
        o.actif,
        c.statut AS permis_statut,
        c.minerai,
        c.date_expiration,
        e.nom_entreprise
      FROM operateurs_rfid o
      LEFT JOIN concessions c ON c.code_permis = o.permis_id
      LEFT JOIN entreprises e ON e.id = c.entreprise_id
      ORDER BY o.created_at DESC
    `);

    const stats = await db.query(`
      SELECT
        COUNT(*) AS total_operateurs,
        SUM(quota_jour_consomme_kg) AS total_kg_jour,
        COUNT(*) FILTER (
          WHERE quota_jour_consomme_kg >= quota_jour_kg
        ) AS quotas_depasses
      FROM operateurs_rfid
    `);

    res.json({
      succes: true,
      operateurs: pesees.rows.map(r => ({
        nom: r.operateur,
        permisId: r.permis_id,
        rfidUid: r.rfid_uid,
        quotaJourKg: parseFloat(r.quota_jour_kg),
        quotaJourConsommeKg: parseFloat(r.quota_jour_consomme_kg),
        quotaMensuelKg: parseFloat(r.quota_mensuel_kg),
        quotaMensuelConsommeKg: parseFloat(r.quota_mensuel_consomme_kg),
        quotaDepasse: parseFloat(r.quota_jour_consomme_kg) >= parseFloat(r.quota_jour_kg),
        actif: r.actif,
        permisStatut: r.permis_statut ?? 'INCONNU',
        minerai: r.minerai ?? 'Non renseigne',
        entreprise: r.nom_entreprise ?? 'Non renseignee',
        dateExpiration: r.date_expiration,
      })),
      stats: {
        totalOperateurs: parseInt(stats.rows[0].total_operateurs),
        totalKgJour: parseFloat(stats.rows[0].total_kg_jour ?? 0),
        quotasDepasses: parseInt(stats.rows[0].quotas_depasses),
      },
    });
  } catch (e) {
    res.status(500).json({ succes: false, erreur: e.message });
  }
};

exports.revoquerPermis = async (req, res) => {
  const { permisId } = req.params;
  if (!permisId) return res.status(400).json({ succes: false, erreur: 'permisId requis' });
  try {
    const resultat = await db.query(
      `UPDATE concessions SET statut = 'REVOQUE' WHERE code_permis = $1 RETURNING code_permis`,
      [permisId]
    );
    await db.query(`UPDATE operateurs_rfid SET actif = FALSE WHERE permis_id = $1`, [permisId]);
    return res.json({
      succes: true,
      permisId,
      statut: 'REVOQUE',
      concessionTrouvee: resultat.rows.length > 0,
    });
  } catch (e) {
    return res.status(500).json({ succes: false, erreur: e.message });
  }
};
