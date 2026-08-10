
CREATE EXTENSION IF NOT EXISTS postgis;

CREATE TYPE statut_concession AS ENUM ('EN_ATTENTE', 'VALIDE', 'SUSPENDU', 'REVOQUE');
CREATE TYPE type_minerai AS ENUM ('OR', 'DIAMANT', 'MANGANESE', 'NICKEL', 'BAUXITE', 'AUTRE');

-- 1. Les Exploitants miniers
-- Séparer l'entreprise de la concession permet à une entreprise de posséder plusieurs permis.
CREATE TABLE entreprises (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    numero_rccm VARCHAR(50) UNIQUE NOT NULL,     -- Registre du commerce
    nom_entreprise VARCHAR(255) NOT NULL,
    contact_principal VARCHAR(255),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 2. Le Périmètres miniers
CREATE TABLE concessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    entreprise_id UUID NOT NULL REFERENCES entreprises(id) ON DELETE CASCADE,
    code_permis VARCHAR(50) UNIQUE NOT NULL,
    minerai type_minerai NOT NULL,
    statut statut_concession DEFAULT 'EN_ATTENTE',
    
    -- Utilisation de MultiPolygon au cas où une concession soit morcelée en plusieurs blocs
    limites_spatiales GEOMETRY(MultiPolygon, 4326) NOT NULL,  
    
    date_attribution DATE,
    date_expiration DATE  
);


-- Index spatial indispensable pour la performance cartographique
CREATE INDEX idx_concessions_spatiale ON concessions USING GIST (limites_spatiales);

-- 3. Gestion des dispositifs IoT
CREATE TABLE capteurs_iot (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    concession_id UUID REFERENCES concessions(id) ON DELETE SET NULL,
    adresse_mac VARCHAR(17) UNIQUE NOT NULL,
    cle_publique_crypto TEXT NOT NULL,           -- Clé pour vérifier que la donnée vient bien de CE capteur
    est_actif BOOLEAN DEFAULT TRUE,
    date_mise_en_service TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 4. Traçabilité des minerais 
CREATE TABLE releves_pesee (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    capteur_id UUID NOT NULL REFERENCES capteurs_iot(id),
    
    poids_mesure_kg NUMERIC(10, 4) NOT NULL CHECK (poids_mesure_kg > 0),
    coordonnees_gps GEOMETRY(Point, 4326) NOT NULL,
    
    -- Mécanique d'immutabilité (concept de blockchain)
    signature_equipement TEXT NOT NULL,          -- Preuve cryptographique
    hash_actuel VARCHAR(64) UNIQUE NOT NULL,     -- Empreinte de cette ligne
    hash_precedent VARCHAR(64) REFERENCES releves_pesee(hash_actuel), -- Lien avec la pesée précédente
    
    date_releve TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_releves_gps ON releves_pesee USING GIST (coordonnees_gps);

-- 5. Centre de Contrôle Anti-Fraude
-- Cette table est générée automatiquement par le backend (Node.js) ou des triggers SQL 
-- lorsqu'une anomalie est détectée (ex: pesée en dehors des limites_spatiales).
CREATE TABLE alertes_fraude (
    id SERIAL PRIMARY KEY,
    releve_id UUID REFERENCES releves_pesee(id) ON DELETE CASCADE,
    type_anomalie VARCHAR(100) NOT NULL,         -- Exemples: 'HORS_ZONE', 'SIGNATURE_COMPROMISE'
    description_detaillee TEXT,
    est_resolu BOOLEAN DEFAULT FALSE,
    date_alerte TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);


