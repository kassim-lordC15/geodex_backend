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
  date_alerte TIMESTAMP DEFAULT NOW()
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
