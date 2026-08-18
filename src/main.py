import time
import requests
from config import API_URL
from arduino_manager import ArduinoManager
from data_generator import generer_pesee_aleatoire

def envoyer_pesee_fictive(gestionnaire_arduino, mode_fraude=False):
    payload = generer_pesee_aleatoire(mode_fraude)
    statut_texte = "🚨 Mode Tricherie" if mode_fraude else "✅ Mode Conforme"
    print(f"\n🚚 [Simulateur] Envoi d'une pesée ({statut_texte})...")

    # Allume la LED en Bleu pendant le traitement de la requête
    gestionnaire_arduino.envoyer_commande_led("B")

    try:
        response = requests.post(API_URL, json=payload, timeout=5)
        print(f"📡 [Serveur Réponse]: {response.status_code}")
        
        # Logique simplifiée (à adapter selon ton backend Node.js)
        est_frauduleux = mode_fraude

        if est_frauduleux:
            print("🔴 Détection de fraude -> LED ROUGE")
            gestionnaire_arduino.envoyer_commande_led("R")
        else:
            print("🟢 Trajet valide -> LED VERTE")
            gestionnaire_arduino.envoyer_commande_led("V")

    except requests.exceptions.RequestException as e:
        print(f"❌ [Erreur Réseau]: Impossible de joindre l'API Node.js. ({e})")
        gestionnaire_arduino.envoyer_commande_led("R")

def demarrer_simulation():
    print("⚡ Démarrage du simulateur de trafic minier.")
    
    # Initialisation du module matériel
    arduino = ArduinoManager()

    try:
        # Étape 1 : 2 camions normaux
        time.sleep(1)
        envoyer_pesee_fictive(arduino, mode_fraude=False)
        time.sleep(3)
        envoyer_pesee_fictive(arduino, mode_fraude=False)

        # Étape 2 : 1 camion pirate
        time.sleep(4)
        envoyer_pesee_fictive(arduino, mode_fraude=True)

        time.sleep(2)
        print("\n🏁 Simulation terminée avec succès.")

    except KeyboardInterrupt:
        print("\n🛑 Arrêt manuel du simulateur par l'utilisateur.")
    
    finally:
        # Assure que le port série est libéré même en cas de crash
        arduino.fermer_connexion()

if __name__ == "__main__":
    demarrer_simulation()