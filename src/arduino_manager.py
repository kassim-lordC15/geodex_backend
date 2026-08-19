import serial
import time
from config import PORT_SERIE, BAUD_RATE

class ArduinoManager:
    def __init__(self):
        self.arduino = None
        try:
            self.arduino = serial.Serial(PORT_SERIE, BAUD_RATE, timeout=1)
            time.sleep(2)  # Temps de redémarrage de l'Arduino
            print(f" Connecté à l'Arduino sur le port {PORT_SERIE}")
        except Exception as e:
            print(f" Avertissement : Impossible d'ouvrir le port série ({e}).")

    def envoyer_commande_led(self, commande):
        """Envoie V, R, B ou E à l'Arduino."""
        if self.arduino and self.arduino.is_open:
            self.arduino.write(commande.encode("utf-8"))
            time.sleep(0.1)

    def attendre_bouton(self):
        """Bloque l'exécution jusqu'à la réception du signal 'S'."""
        if not self.arduino or not self.arduino.is_open:
            print(" Port série inactif. Lancement direct dans 3 secondes...")
            time.sleep(3)
            return

        print("\n En attente de l'appui sur le bouton physique pour démarrer...")
        self.arduino.reset_input_buffer()
        
        while True:
            if self.arduino.in_waiting > 0:
                ligne = self.arduino.readline().decode("utf-8").strip()
                if ligne == "S":
                    print(" Bouton pressé ! C'est parti...")
                    break
            time.sleep(0.1)

    def fermer_connexion(self):
        """Coupe proprement la connexion."""
        if self.arduino and self.arduino.is_open:
            self.envoyer_commande_led("E")
            self.arduino.close()
            print(" Connexion Arduino fermée.")