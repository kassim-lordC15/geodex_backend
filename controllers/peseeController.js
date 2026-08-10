const db = require('../config/db');
const crypto = require('crypto');

// 1. Enregistrer une pesée (IoT)
exports.enregistrerPesee = async (req, res) => {
    const { capteur_id, poids_mesure_kg, latitude, longitude, signature_equipement } = req.body;

    try {
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
                (SELECT limites_spatiales FROM concessions WHERE id = $1),
                ST_GeomFromEWKT($2)
            ) as est_dans_zone;
        `;
        const geoCheck = await db.query(geoQuery, [concession_id, pointGeoJSON]);
        const estDansZone = geoCheck.rows[0] ? geoCheck.rows[0].est_dans_zone : false;

        const lastHashQuery = `SELECT hash_actuel FROM releves_pesee ORDER BY date_releve DESC LIMIT 1`;
        const lastHashResult = await db.query(lastHashQuery);
        const hash_precedent = lastHashResult.rows.length > 0 ? lastHashResult.rows[0].hash_actuel : null;

        const dataToHash = `${capteur_id}-${poids_mesure_kg}-${latitude}-${longitude}-${signature_equipement}-${hash_precedent || 'GENESIS'}-${Date.now()}`;
        const hash_actuel = crypto.createHash('sha256').update(dataToHash).digest('hex');

        const insertReleveQuery = `
            INSERT INTO releves_pesee 
            (capteur_id, poids_mesure_kg, coordonnees_gps, signature_equipement, hash_actuel, hash_precedent)
            VALUES ($1, $2, ST_GeomFromEWKT($3), $4, $5, $6)
            RETURNING id;
        `;
        const releveResult = await db.query(insertReleveQuery, [
            capteur_id, 
            poids_mesure_kg, 
            pointGeoJSON, 
            signature_equipement, 
            hash_actuel, 
            hash_precedent
        ]);
        
        const releve_id = releveResult.rows[0].id;

        if (!estDansZone) {
            const insertAlerteQuery = `
                INSERT INTO alertes_fraude (releve_id, type_anomalie, description_detaillee)
                VALUES ($1, $2, $3)
            `;
            await db.query(insertAlerteQuery, [
                releve_id, 
                'HORS_ZONE', 
                `Pesée hors limites géographiques. Coordonnées: ${latitude}, ${longitude}`
            ]);
        }

        res.status(201).json({
            success: true,
            message: estDansZone ? 'Relevé valide enregistré.' : 'Anomalie détectée : Relevé hors zone, alerte transmise au centre de contrôle.',
            data: {
                releve_id,
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
                   ST_X(r.coordonnees_gps::geometry) as longitude,
                   ST_Y(r.coordonnees_gps::geometry) as latitude,
                   r.poids_mesure_kg
            FROM alertes_fraude a
            JOIN releves_pesee r ON a.releve_id = r.id
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
        const query = `SELECT id, capteur_id, poids_mesure_kg, signature_equipement, hash_actuel, hash_precedent, date_releve FROM releves_pesee ORDER BY date_releve ASC`;
        const result = await db.query(query);
        const rows = result.rows;

        let chaineValide = true;
        let erreurIndex = -1;

        for (let i = 0; i < rows.length; i++) {
            if (i > 0) {
                if (rows[i].hash_precedent !== rows[i - 1].hash_actuel) {
                    chaineValide = false;
                    erreurIndex = rows[i].id;
                    break;
                }
            }
        }

        res.json({
            success: true,
            chaine_integre: chaineValide,
            message: chaineValide 
                ? "L'intégrité de la base de données est garantie. Aucun registre n'a été altéré." 
                : `FRAUDE DÉTECTÉE ! Une modification non autorisée a eu lieu au niveau de l'enregistrement ID: ${erreurIndex}`
        });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
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
                ST_AsGeoJSON(c.limites_spatiales)::json AS geojson
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