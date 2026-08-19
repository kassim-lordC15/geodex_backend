import random
from config import CAPTEUR_ID, SIGNATURE_EQUIPEMENT

def generer_pesee_aleatoire(mode_fraude=False):
    """Génère un dictionnaire représentant le JSON de la pesée."""
    # Coordonnées de base (Proche de la mine de Séguéla)
    latitude = 7.9611
    longitude = -6.6722

    if mode_fraude:
        # Décale le camion pour déclencher l'alerte géospatiale
        latitude += 0.5
        longitude -= 0.5
    else:
        # Micro-variations normales
        latitude += (random.random() - 0.5) * 0.001
        longitude += (random.random() - 0.5) * 0.001

    poids_mesure_kg = random.randint(35000, 60000)

    return {
        "capteur_id": CAPTEUR_ID,
        "poids_mesure_kg": poids_mesure_kg,
        "latitude": latitude,
        "longitude": longitude,
        "signature_equipement": SIGNATURE_EQUIPEMENT,
    }