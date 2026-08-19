import time
import random
import requests
from config import API_URL
from arduino_manager import ArduinoManager
from data_generator import generer_pesee_aleatoire

# Importation du module son PC
from sound_manager import jouer_son_conforme, jouer_son_fraude

def envoyer_pesee_fictive(gestionnaire_arduino, mode_fraude=False):
    payload = generer_pesee_aleatoire(mode_fraude)
    statut_texte = " Mode Tricherie" if mode_fraude else " Mode Conforme"
    print(f"\n [Simulateur] Envoi d'une pesée ({statut_texte})...")

    # 1. Allume en BLEU pour simuler le traitement
    gestionnaire_arduino.envoyer_commande_led("B")
    time.sleep(1) # Force 1 seconde de bleu (effet visuel de réflexion)

    try:
        response = requests.post(API_URL, json=payload, timeout=5)
        print(f"📡 [Serveur Réponse]: {response.status_code}")
        
        if mode_fraude:
            print(" Détection de fraude -> LED ROUGE + Alarme PC")
            gestionnaire_arduino.envoyer_commande_led("R") 
            jouer_son_fraude()
        else:
            print(" Trajet valide -> LED VERTE + Bip PC")
            gestionnaire_arduino.envoyer_commande_led("V") 
            jouer_son_conforme()

    except requests.exceptions.RequestException as e:
        print(f" [Erreur Réseau]: Impossible de joindre l'API Node.js. ({e})")
        gestionnaire_arduino.envoyer_commande_led("R")
        jouer_son_fraude()

    # 2. Maintient la couleur de résultat bien visible pendant 2 secondes
    time.sleep(2)
    
    # 3. Éteint la LED pour faire une vraie coupure avant le prochain camion
    gestionnaire_arduino.envoyer_commande_led("E")

def demarrer_simulation():
    print(" Démarrage de l'interface GéoDex.")
    
    arduino = ArduinoManager()

    try:
        while True:
            arduino.attendre_bouton()

            nombre_camions = random.randint(3, 6)
            index_fraude = random.randint(0, nombre_camions - 1)

            print(f"\n Nouvelle vague de remontées IoT : {nombre_camions} camions détectés.")

            for i in range(nombre_camions):
                est_une_fraude = (i == index_fraude)
                envoyer_pesee_fictive(arduino, mode_fraude=est_une_fraude)
                
                if i < nombre_camions - 1:
                    # L'attente se fait avec la LED éteinte
                    delai = random.uniform(2.0, 3.0)
                    print(f" Attente de {delai:.1f}s avant la prochaine pesée...")
                    time.sleep(delai)

            print("\n Fin de ce test. Appuyez sur le bouton pour en relancer un.")

    except KeyboardInterrupt:
        print("\n Arrêt manuel du simulateur par l'utilisateur.")
    
    finally:
        arduino.fermer_connexion()

if __name__ == "__main__":
    demarrer_simulation()