import winsound
import threading

def jouer_son_conforme():
    """Joue un petit double bip aigu (Succès)."""
    def bip():
        winsound.Beep(2000, 150)
        winsound.Beep(2500, 150)
    threading.Thread(target=bip, daemon=True).start()

def jouer_son_fraude():
    """Génère une sirène de type 'Pin-Pon' très agressive."""
    def sirene_police():
        # Répète l'alarme 4 fois
        for _ in range(3):
            winsound.Beep(900, 350)  # Pin (Aigu)
            winsound.Beep(700, 350)  # Pon (Plus grave)
            
    threading.Thread(target=sirene_police, daemon=True).start()
