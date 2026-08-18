import serial
import time
from config import PORT_SERIE, BAUD_RATE

class ArduinoManager:
    def __init__(self):
        self.arduino = None
        try:
            self.arduino = serial.Serial(PORT_SERIE, BAUD_RATE, timeout=1)
            time.sleep(2)  # Laisse le temps à l'Arduino de redémarrer
            print(f"✅ Connecté à l'Arduino sur le port {PORT_SERIE}")
        except Exception as e:
            print(f"⚠️ Avertissement : Impossible d'ouvrir le port série ({e}). Le script continuera sans la LED.")

    def envoyer_commande_led(self, couleur):
        """Envoie la lettre correspondante (V, R, B, E) à la carte."""
        if self.arduino and self.arduino.is_open:
            self.arduino.write(couleur.encode("utf-8"))
            time.sleep(0.1)

    def fermer_connexion(self):
        """Éteint la LED et libère le port USB proprement."""
        if self.arduino and self.arduino.is_open:
            self.envoyer_commande_led("E")
            self.arduino.close()
            print("🔌 Connexion Arduino fermée.")