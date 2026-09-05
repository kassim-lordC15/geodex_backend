-- ============================================================
-- GEODEX Backend — Initialisation PostgreSQL + PostGIS
-- Hackathon SIREXE 2026 — Ministère des Mines CI
-- ============================================================

-- 1. Extension PostGIS
CREATE EXTENSION IF NOT EXISTS postgis;

-- 2. Types ENUM
CREATE TYPE statut_concession AS ENUM 
  ('EN_ATTENTE', 'VALIDE', 'SUSPENDU', 'REVOQUE');

CREATE TYPE type_minerai AS ENUM 
  ('OR', 'DIAMANT', 'MANGANESE', 'NICKEL', 'BAUXITE', 'AUTRE');

-- 3. Table entreprises
CREATE TABLE IF NOT EXISTS entreprises (
  id TEXT PRIMARY KEY,
  nom_entreprise TEXT NOT NULL,
  pays TEXT DEFAULT 'CI',
  created_at TIMESTAMP DEFAULT NOW()
);

-- 4. Table concessions
CREATE TABLE IF NOT EXISTS concessions (
  id TEXT PRIMARY KEY,
  code_permis TEXT NOT NULL UNIQUE,
  entreprise_id TEXT REFERENCES entreprises(id),
  minerai type_minerai NOT NULL,
  statut statut_concession NOT NULL DEFAULT 'EN_ATTENTE',
  date_attribution DATE,
  date_expiration DATE,
  limites_spatialiaux GEOGRAPHY(MULTIPOLYGON, 4326),
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_concessions_spatial 
  ON concessions USING GIST (limites_spatialiaux);

CREATE INDEX IF NOT EXISTS idx_concessions_statut 
  ON concessions (statut);

-- 5. Table capteurs_iot
CREATE TABLE IF NOT EXISTS capteurs_iot (
  id TEXT PRIMARY KEY,
  concession_id TEXT REFERENCES concessions(id),
  est_actif BOOLEAN DEFAULT TRUE,
  signature_equipement TEXT,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_capteurs_concession 
  ON capteurs_iot (concession_id);

-- 6. Table releves_pesee
CREATE TABLE IF NOT EXISTS releves_pesee (
  id TEXT PRIMARY KEY,
  capteur_id TEXT REFERENCES capteurs_iot(id),
  poids_mesure_kg DOUBLE PRECISION NOT NULL,
  coordonnees_gps GEOGRAPHY(POINT, 4326) NOT NULL,
  signature_equipement TEXT NOT NULL,
  hash_actuel TEXT NOT NULL,
  hash_precedent TEXT,
  date_releve TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_releves_gps 
  ON releves_pesee USING GIST (coordonnees_gps);

CREATE INDEX IF NOT EXISTS idx_releves_capteur 
  ON releves_pesee (capteur_id);

CREATE INDEX IF NOT EXISTS idx_releves_date 
  ON releves_pesee (date_releve);

-- 7. Table alertes_fraude
CREATE TABLE IF NOT EXISTS alertes_fraude (
  id TEXT PRIMARY KEY,
  releve_id TEXT REFERENCES releves_pesee(id),
  type_anomalie TEXT NOT NULL,
  description_detaillee TEXT,
  date_alerte TIMESTAMP DEFAULT NOW(),
  rfid_uid TEXT,
  operateur_nom TEXT,
  permis_numero TEXT,
  site_nom TEXT,
  statut VARCHAR(32) DEFAULT 'NON_TRAITEE',
  latitude DECIMAL(10,6) DEFAULT 0,
  longitude DECIMAL(10,6) DEFAULT 0,
  poids_kg DECIMAL(10,3) DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_alertes_releve 
  ON alertes_fraude (releve_id);

CREATE INDEX IF NOT EXISTS idx_alertes_date 
  ON alertes_fraude (date_alerte);

-- ============================================================
-- DONNÉES DE DÉMO
-- ============================================================

-- Entreprises
INSERT INTO entreprises (id, nom_entreprise) VALUES
  ('ENT-001', 'Rangold Resources CI'),
  ('ENT-002', 'Endeavour Mining CI'),
  ('ENT-003', 'Inconnue'),
  ('ENT-004', 'Newmont CI')
ON CONFLICT (id) DO NOTHING;

-- 5 sites de démo cohérents avec le frontend Flutter
-- Tongon (valide)
INSERT INTO concessions (id, code_permis, entreprise_id, minerai, statut, date_attribution, date_expiration, limites_spatialiaux) VALUES
  ('CONC-001', 'PM-CI-2024-001', 'ENT-001', 'OR', 'VALIDE', '2024-01-15', '2028-06-15',
   ST_GeographyFromText('SRID=4326;MULTIPOLYGON(((-6.493 9.177, -6.473 9.177, -6.473 9.157, -6.493 9.157, -6.493 9.177)))'))
ON CONFLICT (id) DO NOTHING;

-- Séguéla (valide)
INSERT INTO concessions (id, code_permis, entreprise_id, minerai, statut, date_attribution, date_expiration, limites_spatialiaux) VALUES
  ('CONC-002', 'PM-CI-2024-002', 'ENT-002', 'OR', 'VALIDE', '2024-03-01', '2029-03-20',
   ST_GeographyFromText('SRID=4326;MULTIPOLYGON(((-6.677 7.977, -6.657 7.977, -6.657 7.957, -6.677 7.957, -6.677 7.977)))'))
ON CONFLICT (id) DO NOTHING;

-- Boundiali Nord (illégal / révoqué)
INSERT INTO concessions (id, code_permis, entreprise_id, minerai, statut, date_attribution, date_expiration, limites_spatialiaux) VALUES
  ('CONC-003', 'PM-CI-2023-087', 'ENT-003', 'OR', 'REVOQUE', '2023-06-01', '2024-06-01',
   ST_GeographyFromText('SRID=4326;MULTIPOLYGON(((-6.53 9.57, -6.43 9.57, -6.43 9.47, -6.53 9.47, -6.53 9.57)))'))
ON CONFLICT (id) DO NOTHING;

-- Hiré (suspendu)
INSERT INTO concessions (id, code_permis, entreprise_id, minerai, statut, date_attribution, date_expiration, limites_spatialiaux) VALUES
  ('CONC-004', 'PM-CI-2024-003', 'ENT-001', 'OR', 'SUSPENDU', '2024-05-01', '2026-05-01',
   ST_GeographyFromText('SRID=4326;MULTIPOLYGON(((-4.393 5.743, -4.373 5.743, -4.373 5.723, -4.393 5.723, -4.393 5.743)))'))
ON CONFLICT (id) DO NOTHING;

-- Koun-Fao (révoqué / nickel)
INSERT INTO concessions (id, code_permis, entreprise_id, minerai, statut, date_attribution, date_expiration, limites_spatialiaux) VALUES
  ('CONC-005', 'PM-CI-2024-004', 'ENT-004', 'NICKEL', 'REVOQUE', '2024-02-15', '2025-02-15',
   ST_GeographyFromText('SRID=4326;MULTIPOLYGON(((-3.01 7.293, -2.99 7.293, -2.99 7.273, -3.01 7.273, -3.01 7.293)))'))
ON CONFLICT (id) DO NOTHING;

-- Capteurs IoT (1 par concession)
INSERT INTO capteurs_iot (id, concession_id, signature_equipement) VALUES
  ('SENSOR-001', 'CONC-001', 'SECURE_HARDWARE_SIGN_METER_01'),
  ('SENSOR-002', 'CONC-002', 'SECURE_HARDWARE_SIGN_METER_02'),
  ('SENSOR-003', 'CONC-003', 'SECURE_HARDWARE_SIGN_METER_03'),
  ('SENSOR-004', 'CONC-004', 'SECURE_HARDWARE_SIGN_METER_04'),
  ('SENSOR-005', 'CONC-005', 'SECURE_HARDWARE_SIGN_METER_05')
ON CONFLICT (id) DO NOTHING;

-- 10 relevés de pesée de démo avec hash chain valide
-- Genesis hash (premier bloc)
INSERT INTO releves_pesee (id, capteur_id, poids_mesure_kg, coordonnees_gps, signature_equipement, hash_actuel, hash_precedent, date_releve) VALUES
  ('RELEV-001', 'SENSOR-001', 48.2, ST_GeographyFromText('SRID=4326;POINT(-6.483 9.167)'), 'SECURE_HARDWARE_SIGN_METER_01', 
   'a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2', 
   NULL, 
   '2026-08-10T08:00:00Z')
ON CONFLICT (id) DO NOTHING;

INSERT INTO releves_pesee (id, capteur_id, poids_mesure_kg, coordonnees_gps, signature_equipement, hash_actuel, hash_precedent, date_releve) VALUES
  ('RELEV-002', 'SENSOR-001', 51.7, ST_GeographyFromText('SRID=4326;POINT(-6.483 9.167)'), 'SECURE_HARDWARE_SIGN_METER_01', 
   'b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3', 
   'a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2', 
   '2026-08-10T09:15:00Z')
ON CONFLICT (id) DO NOTHING;

INSERT INTO releves_pesee (id, capteur_id, poids_mesure_kg, coordonnees_gps, signature_equipement, hash_actuel, hash_precedent, date_releve) VALUES
  ('RELEV-003', 'SENSOR-002', 44.1, ST_GeographyFromText('SRID=4326;POINT(-6.667 7.967)'), 'SECURE_HARDWARE_SIGN_METER_02', 
   'c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4', 
   'b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3', 
   '2026-08-10T10:30:00Z')
ON CONFLICT (id) DO NOTHING;

INSERT INTO releves_pesee (id, capteur_id, poids_mesure_kg, coordonnees_gps, signature_equipement, hash_actuel, hash_precedent, date_releve) VALUES
  ('RELEV-004', 'SENSOR-003', 38.5, ST_GeographyFromText('SRID=4326;POINT(-6.48 9.52)'), 'SECURE_HARDWARE_SIGN_METER_03', 
   'd4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5', 
   'c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4', 
   '2026-08-10T11:45:00Z')
ON CONFLICT (id) DO NOTHING;

INSERT INTO releves_pesee (id, capteur_id, poids_mesure_kg, coordonnees_gps, signature_equipement, hash_actuel, hash_precedent, date_releve) VALUES
  ('RELEV-005', 'SENSOR-002', 52.3, ST_GeographyFromText('SRID=4326;POINT(-6.667 7.967)'), 'SECURE_HARDWARE_SIGN_METER_02', 
   'e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6', 
   'd4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5', 
   '2026-08-10T12:00:00Z')
ON CONFLICT (id) DO NOTHING;

INSERT INTO releves_pesee (id, capteur_id, poids_mesure_kg, coordonnees_gps, signature_equipement, hash_actuel, hash_precedent, date_releve) VALUES
  ('RELEV-006', 'SENSOR-001', 49.8, ST_GeographyFromText('SRID=4326;POINT(-6.483 9.167)'), 'SECURE_HARDWARE_SIGN_METER_01', 
   'f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1', 
   'e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6', 
   '2026-08-10T13:15:00Z')
ON CONFLICT (id) DO NOTHING;

INSERT INTO releves_pesee (id, capteur_id, poids_mesure_kg, coordonnees_gps, signature_equipement, hash_actuel, hash_precedent, date_releve) VALUES
  ('RELEV-007', 'SENSOR-004', 35.2, ST_GeographyFromText('SRID=4326;POINT(-4.383 5.733)'), 'SECURE_HARDWARE_SIGN_METER_04', 
   'a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3', 
   'f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1', 
   '2026-08-10T14:00:00Z')
ON CONFLICT (id) DO NOTHING;

INSERT INTO releves_pesee (id, capteur_id, poids_mesure_kg, coordonnees_gps, signature_equipement, hash_actuel, hash_precedent, date_releve) VALUES
  ('RELEV-008', 'SENSOR-005', 42.0, ST_GeographyFromText('SRID=4326;POINT(-3.0 7.283)'), 'SECURE_HARDWARE_SIGN_METER_05', 
   'b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4', 
   'a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3', 
   '2026-08-10T15:30:00Z')
ON CONFLICT (id) DO NOTHING;

INSERT INTO releves_pesee (id, capteur_id, poids_mesure_kg, coordonnees_gps, signature_equipement, hash_actuel, hash_precedent, date_releve) VALUES
  ('RELEV-009', 'SENSOR-001', 55.3, ST_GeographyFromText('SRID=4326;POINT(-6.483 9.167)'), 'SECURE_HARDWARE_SIGN_METER_01', 
   'c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5', 
   'b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4', 
   '2026-08-10T16:45:00Z')
ON CONFLICT (id) DO NOTHING;

INSERT INTO releves_pesee (id, capteur_id, poids_mesure_kg, coordonnees_gps, signature_equipement, hash_actuel, hash_precedent, date_releve) VALUES
  ('RELEV-010', 'SENSOR-002', 48.9, ST_GeographyFromText('SRID=4326;POINT(-6.667 7.967)'), 'SECURE_HARDWARE_SIGN_METER_02', 
   'd4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6', 
   'c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5', 
   '2026-08-10T17:00:00Z')
ON CONFLICT (id) DO NOTHING;

-- 3 alertes fraude sur Boundiali Nord (RELEV-004)
INSERT INTO alertes_fraude (id, releve_id, type_anomalie, description_detaillee) VALUES
  ('ALERT-001', 'RELEV-004', 'HORS_ZONE', 'Pesée hors limites géographiques de la concession PM-CI-2023-087')
ON CONFLICT (id) DO NOTHING;

INSERT INTO alertes_fraude (id, releve_id, type_anomalie, description_detaillee) VALUES
  ('ALERT-002', 'RELEV-004', 'SIGNATURE_COMPROMISE', 'Signature équipement invalide pour le capteur SENSOR-003')
ON CONFLICT (id) DO NOTHING;

INSERT INTO alertes_fraude (id, releve_id, type_anomalie, description_detaillee) VALUES
  ('ALERT-003', 'RELEV-004', 'HORS_ZONE', 'Camion détecté à 500m de la zone autorisée - Coordonnées: 9.52, -6.48')
ON CONFLICT (id) DO NOTHING;

-- 4. Table operateurs_rfid (badges RFID + quotas)
CREATE TABLE IF NOT EXISTS operateurs_rfid (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  rfid_uid VARCHAR(64) UNIQUE NOT NULL,
  nom VARCHAR(255) NOT NULL,
  permis_id VARCHAR(64),
  permis_numero VARCHAR(64),
  site_nom VARCHAR(128),
  quota_jour_kg DECIMAL(10,3) NOT NULL DEFAULT 0.500,
  quota_mensuel_kg DECIMAL(10,3) NOT NULL DEFAULT 12.000,
  quota_jour_consomme_kg DECIMAL(10,3) NOT NULL DEFAULT 0,
  quota_mensuel_consomme_kg DECIMAL(10,3) NOT NULL DEFAULT 0,
  sites_autorises TEXT[] DEFAULT ARRAY['Tongon'],
  date_expiration DATE,
  actif BOOLEAN DEFAULT true,
  coordonnees_site GEOGRAPHY(POINT, 4326),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_operateurs_rfid_uid ON operateurs_rfid(rfid_uid);

INSERT INTO operateurs_rfid (
  rfid_uid, nom, permis_numero, site_nom,
  quota_jour_kg, quota_mensuel_kg,
  quota_jour_consomme_kg, quota_mensuel_consomme_kg,
  date_expiration, sites_autorises,
  coordonnees_site
)
SELECT * FROM (VALUES
  ('CARD-A1B2C3', 'KONÉ Ibrahim',  'PM-CI-2019-001', 'Tongon',
   0.500, 12.000, 0.120, 3.400,
   '2029-03-11'::date, ARRAY['Tongon','Séguéla'],
   ST_SetSRID(ST_MakePoint(-6.483, 9.167), 4326)::geography),

  ('CARD-D4E5F6', 'KOUASSI Aya',   'PM-CI-2021-088', 'Séguéla',
   0.300, 8.000, 0.299, 7.800,
   '2031-04-19'::date, ARRAY['Séguéla'],
   ST_SetSRID(ST_MakePoint(-6.67, 8.00), 4326)::geography),

  ('CARD-QUOTA0', 'BAMBA Seydou',  'PM-CI-2014-003', 'Agbaou',
   0.300, 8.000, 0.300, 8.000,
   '2024-01-31'::date, ARRAY['Agbaou'],
   ST_SetSRID(ST_MakePoint(-5.73, 6.32), 4326)::geography)
) AS v(rfid_uid, nom, permis_numero, site_nom,
       quota_jour_kg, quota_mensuel_kg,
       quota_jour_consomme_kg, quota_mensuel_consomme_kg,
       date_expiration, sites_autorises, coordonnees_site)
WHERE NOT EXISTS (SELECT 1 FROM operateurs_rfid LIMIT 1);

-- 5. Table zones_permis (geofence bornes)
CREATE TABLE IF NOT EXISTS zones_permis (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  permis_numero VARCHAR(64) NOT NULL,
  site_nom VARCHAR(128),
  zone GEOGRAPHY(POLYGON, 4326) NOT NULL,
  rayon_tolerance_m INTEGER DEFAULT 5000
);

CREATE INDEX IF NOT EXISTS idx_zones_permis_permis ON zones_permis(permis_numero);

INSERT INTO zones_permis (permis_numero, site_nom, zone)
SELECT * FROM (VALUES
  ('PM-CI-2019-001', 'Tongon',
   ST_GeogFromText('SRID=4326;POLYGON((-6.60 9.05,-6.37 9.05,-6.37 9.28,-6.60 9.28,-6.60 9.05))')),
  ('PM-CI-2021-088', 'Séguéla',
   ST_GeogFromText('SRID=4326;POLYGON((-6.80 7.88,-6.54 7.88,-6.54 8.12,-6.80 8.12,-6.80 7.88))')),
  ('PM-CI-2014-003', 'Agbaou',
   ST_GeogFromText('SRID=4326;POLYGON((-5.86 6.20,-5.60 6.20,-5.60 6.44,-5.86 6.44,-5.86 6.20))'))
) AS v(permis_numero, site_nom, zone)
WHERE NOT EXISTS (SELECT 1 FROM zones_permis LIMIT 1);

-- 6. Table pesees_borne (journal cycles complets borne)
CREATE TABLE IF NOT EXISTS pesees_borne (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  rfid_uid VARCHAR(64) NOT NULL,
  operateur_nom VARCHAR(255),
  permis_numero VARCHAR(64),
  permis_id VARCHAR(64),
  site_nom VARCHAR(128),
  poids_net_kg DECIMAL(10,3) NOT NULL,
  hors_zone BOOLEAN DEFAULT false,
  distance_zone_m INTEGER DEFAULT 0,
  statut VARCHAR(32) DEFAULT 'valide',
  passeport_id VARCHAR(128),
  signature VARCHAR(255),
  qr_payload TEXT,
  latitude DECIMAL(10,6),
  longitude DECIMAL(10,6),
  borne_id VARCHAR(64) DEFAULT 'BORNE-TONGON-01',
  date_cycle TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  hash_chaine VARCHAR(255),
  hash_precedent_chaine VARCHAR(255),
  index_bloc INTEGER
);

CREATE INDEX IF NOT EXISTS idx_pesees_borne_rfid ON pesees_borne(rfid_uid);
CREATE INDEX IF NOT EXISTS idx_pesees_borne_date ON pesees_borne(date_cycle);
CREATE INDEX IF NOT EXISTS idx_pesees_borne_permis ON pesees_borne(permis_numero);

-- ============================================================
-- TRIGGERS — Chaîne d'intégrité automatique
-- ============================================================

-- Fonction de calcul automatique du hash de chaîne
CREATE OR REPLACE FUNCTION calculer_hash_chaine()
RETURNS TRIGGER AS $$
DECLARE
  precedent RECORD;
  input_text TEXT;
BEGIN
  -- Récupérer le bloc précédent
  SELECT hash_chaine, index_bloc INTO precedent
  FROM pesees_borne
  WHERE id != NEW.id
    AND (NEW.rfid_uid IS NULL OR rfid_uid = NEW.rfid_uid)
  ORDER BY date_cycle DESC
  LIMIT 1;

  -- Construire l'input du hash
  input_text := (
    COALESCE(NEW.rfid_uid, '') || '|' ||
    COALESCE(NEW.operateur_nom, '') || '|' ||
    COALESCE(NEW.permis_numero, '') || '|' ||
    COALESCE(NEW.poids_net_kg::TEXT, '0') || '|' ||
    COALESCE(NEW.date_cycle::TEXT, '') || '|' ||
    COALESCE(precedent.hash_chaine, 'GENESIS') || '|' ||
    extract(epoch from NOW())::TEXT
  );

  -- Calculer le hash
  NEW.hash_chaine := encode(digest(input_text, 'sha256'), 'hex');
  NEW.hash_precedent_chaine := precedent.hash_chaine;
  NEW.index_bloc := COALESCE(precedent.index_bloc, 0) + 1;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger sur INSERT pour calculer automatiquement le hash
DROP TRIGGER IF EXISTS trg_calculer_hash_chaine ON pesees_borne;
CREATE TRIGGER trg_calculer_hash_chaine
  BEFORE INSERT ON pesees_borne
  FOR EACH ROW
  WHEN (NEW.hash_chaine IS NULL)
  EXECUTE FUNCTION calculer_hash_chaine();

-- Fonction de détection de falsification
CREATE OR REPLACE FUNCTION detecter_falsification()
RETURNS TRIGGER AS $$
BEGIN
  -- Si le hash a été modifié manuellement, créer une alerte
  IF NEW.hash_chaine IS NOT NULL AND OLD.hash_chaine IS NOT NULL
     AND NEW.hash_chaine != OLD.hash_chaine THEN
    INSERT INTO alertes_fraude (
      id, type_anomalie, description, rfid_uid, operateur_nom,
      permis_numero, site_nom, poids_kg, latitude, longitude,
      date_alerte, statut
    ) VALUES (
      gen_random_uuid()::TEXT,
      'FALSIFICATION_CHAINE',
      'Modification manuelle détectée sur bloc #' || COALESCE(NEW.index_bloc::TEXT, '?') ||
      ' — ' || COALESCE(NEW.operateur_nom, NEW.rfid_uid),
      NEW.rfid_uid,
      NEW.operateur_nom,
      NEW.permis_numero,
      NEW.site_nom,
      NEW.poids_net_kg,
      NEW.latitude,
      NEW.longitude,
      NOW(),
      'NON_TRAITEE'
    )
    ON CONFLICT DO NOTHING;
  END IF;

  -- Si le poids a été modifié, créer une alerte
  IF NEW.poids_net_kg IS NOT NULL AND OLD.poids_net_kg IS NOT NULL
     AND NEW.poids_net_kg != OLD.poids_net_kg THEN
    INSERT INTO alertes_fraude (
      id, type_anomalie, description, rfid_uid, operateur_nom,
      permis_numero, site_nom, poids_kg, latitude, longitude,
      date_alerte, statut
    ) VALUES (
      gen_random_uuid()::TEXT,
      'FALSIFICATION_CHAINE',
      'Poids modifié sur bloc #' || COALESCE(NEW.index_bloc::TEXT, '?') ||
      ' — ' || COALESCE(NEW.operateur_nom, NEW.rfid_uid) ||
      ' — ancien: ' || OLD.poids_net_kg || 'kg, nouveau: ' || NEW.poids_net_kg || 'kg',
      NEW.rfid_uid,
      NEW.operateur_nom,
      NEW.permis_numero,
      NEW.site_nom,
      NEW.poids_net_kg,
      NEW.latitude,
      NEW.longitude,
      NOW(),
      'NON_TRAITEE'
    )
    ON CONFLICT DO NOTHING;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger sur UPDATE pour détecter les modifications
DROP TRIGGER IF EXISTS trg_detecter_falsification ON pesees_borne;
CREATE TRIGGER trg_detecter_falsification
  AFTER UPDATE ON pesees_borne
  FOR EACH ROW
  WHEN (OLD.hash_chaine IS NOT NULL AND NEW.hash_chaine != OLD.hash_chaine)
  EXECUTE FUNCTION detecter_falsification();

-- Trigger UPDATE pour alerter aussi si poids_net_kg modifié
DROP TRIGGER IF EXISTS trg_alerte_poids_modifie ON pesees_borne;
CREATE TRIGGER trg_alerte_poids_modifie
  AFTER UPDATE ON pesees_borne
  FOR EACH ROW
  WHEN (OLD.poids_net_kg IS NOT NULL AND NEW.poids_net_kg != OLD.poids_net_kg)
  EXECUTE FUNCTION detecter_falsification();
