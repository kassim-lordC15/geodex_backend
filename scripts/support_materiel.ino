#include <SPI.h>
#include <MFRC522.h>
#include <Wire.h>
#include <Adafruit_GFX.h>
#include <Adafruit_SH110X.h>

// ============================================================
//                    CONFIGURATION OLED 1.3" I2C
// ============================================================
#define SCREEN_WIDTH 128
#define SCREEN_HEIGHT 64
#define OLED_RESET -1

Adafruit_SH1106G display = Adafruit_SH1106G(SCREEN_WIDTH, SCREEN_HEIGHT, &Wire, OLED_RESET);

// ============================================================
//                    BROCHES (PINS) - ARDUINO MEGA
// ============================================================
const int TRIG_PIN = 5;
const int ECHO_PIN = 4;

const int LED_JAUNE = 2;
const int LED_ROUGE = 3;
const int LED_VERTE = 6;

const int BTN_VERT  = 8; 
const int BTN_ROUGE = 7; 

const int POT_PIN   = A0;
const int BUZZER_PIN = A1;

const int RFID_SS_PIN  = 10;
const int RFID_RST_PIN = 9;

MFRC522 rfid(RFID_SS_PIN, RFID_RST_PIN);

// ============================================================
//               PARAMÈTRES & UID DES EXPLOITANTS
// ============================================================
const float DISTANCE_SEUIL = 10.0;

// Cartes RFID enregistrées
byte UID_CARTE_1[4] = { 0x53, 0xEE, 0xE1, 0x28 };
byte UID_CARTE_2[4] = { 0x63, 0xA9, 0x91, 0x13 };

// Quotas restants par coopérative (en Kg)
float quotaAlpha = 500.0;
float quotaBeta  = 300.0;

int idExploitantActuel = 0;
String exploitantActuel = "";

// ============================================================
//                    ÉTATS DE LA BORNE
// ============================================================
enum EtatBorne {
  VERROUILLE,     
  AUTORISE,       
  PESEE_EN_COURS, 
  PESEE_VALIDEE   
};

EtatBorne etat = VERROUILLE;

bool presenceObjet = false;
unsigned long previousMillisBlink = 0;
bool ledJauneState = LOW;

// ============================================================
//                    PROTOTYPES
// ============================================================
float mesurerDistance();
bool nouvelleCarteRFID();
int verifierCarte();
bool boutonAppuye(int pin);
void declencherAlerte();
void bipSucces();
void resetBorne();
void afficherEcran(String titre, String ligne1, String ligne2, String ligne3);

// ============================================================
//                    SETUP
// ============================================================
void setup() {
  Serial.begin(9600);
  while (!Serial);

  pinMode(53, OUTPUT);

  pinMode(TRIG_PIN, OUTPUT);
  pinMode(ECHO_PIN, INPUT);

  pinMode(LED_JAUNE, OUTPUT);
  pinMode(LED_ROUGE, OUTPUT);
  pinMode(LED_VERTE, OUTPUT);

  pinMode(BTN_VERT, INPUT_PULLUP);
  pinMode(BTN_ROUGE, INPUT_PULLUP);

  pinMode(BUZZER_PIN, OUTPUT);

  delay(100);
  display.begin(0x3C, true); 
  display.clearDisplay();

  SPI.begin();
  rfid.PCD_Init();
  rfid.PCD_AntennaOn();

  resetBorne();
}

// ============================================================
//                    LOOP
// ============================================================
void loop() {

  // ----------------------------------------------------------
  // ÉTAT 1 : BORNE VERROUILLÉE (Attente RFID)
  // ----------------------------------------------------------
  if (etat == VERROUILLE) {
    if (nouvelleCarteRFID()) {
      int id = verifierCarte();

      if (id > 0) {
        idExploitantActuel = id;
        float quotaDispo = 0;

        if (id == 1) {
          exploitantActuel = "Coop. Alpha";
          quotaDispo = quotaAlpha;
        } else if (id == 2) {
          exploitantActuel = "Coop. Beta";
          quotaDispo = quotaBeta;
        }

        // Vérification si le quota est déjà épuisé
        if (quotaDispo <= 0.0) {
          afficherEcran("GEODEX - ALERTE", exploitantActuel, "QUOTA EPUISE !", "Acces refuse");
          declencherAlerte();
          delay(10000);
          resetBorne();
        } else {
          etat = AUTORISE;
          digitalWrite(LED_ROUGE, LOW);
          digitalWrite(LED_VERTE, HIGH);

          bipSucces();
          afficherEcran("GEODEX - ACCES", exploitantActuel, "Quota: " + String(quotaDispo, 1) + " Kg", "Deposez l'or...");
        }

      } else {
        // Carte non enregistrée
        afficherEcran("GEODEX - ALERTE", "CARTE REFUSEE !", "Acces non autorise", "Veuillez reessayer");
        declencherAlerte();
        delay(10000); // Pause de 10 secondes
        resetBorne();
      }
    }
  }

  // ----------------------------------------------------------
  // ÉTAT 2 : BORNE AUTORISÉE (Attente du dépôt du minerai)
  // ----------------------------------------------------------
  else if (etat == AUTORISE) {
    float distance = mesurerDistance();

    if (distance > 1.0 && distance <= DISTANCE_SEUIL) {
      etat = PESEE_EN_COURS;
      presenceObjet = true;
      
      afficherEcran("PESEE EN COURS", "Mesure en cours...", "Stabilisation...", "VERT = Valider");
    }
  }

  // ----------------------------------------------------------
  // ÉTAT 3 : PESÉE EN COURS
  // ----------------------------------------------------------
  else if (etat == PESEE_EN_COURS) {
    int valPot = analogRead(POT_PIN);

    // Clignotement de la LED Jaune
    int vitesse = map(valPot, 0, 1023, 100, 800);
    unsigned long currentMillis = millis();
    if (currentMillis - previousMillisBlink >= vitesse) {
      previousMillisBlink = currentMillis;
      ledJauneState = !ledJauneState;
      digitalWrite(LED_JAUNE, ledJauneState);
    }

    // Validation manuelle de la pesée
    if (boutonAppuye(BTN_VERT)) {
      float poidsPlein = map(valPot, 0, 1023, 0, 5000) / 100.0; // Poids mesuré en Kg

      // Déduction du quota selon l'exploitant
      if (idExploitantActuel == 1) {
        quotaAlpha -= poidsPlein;
        if (quotaAlpha < 0) quotaAlpha = 0; // Sécurité anti-négatif
      } else if (idExploitantActuel == 2) {
        quotaBeta -= poidsPlein;
        if (quotaBeta < 0) quotaBeta = 0;
      }

      float quotaRestant = (idExploitantActuel == 1) ? quotaAlpha : quotaBeta;

      etat = PESEE_VALIDEE;
      digitalWrite(LED_JAUNE, LOW);
      digitalWrite(LED_VERTE, HIGH);

      bipSucces();

      // Affichage du passeport avec le quota restant mis à jour
      afficherEcran("PASSEPORT GENERE", "Poids: " + String(poidsPlein, 1) + " Kg", "Reste: " + String(quotaRestant, 1) + " Kg", "ROUGE = Quitter");
    }
  }

  // ----------------------------------------------------------
  // BOUTON ROUGE : RESET / REVERROUILLAGE
  // ----------------------------------------------------------
  if (boutonAppuye(BTN_ROUGE)) {
    resetBorne();
  }

  delay(50);
}

// ============================================================
//                   FONCTIONS AUXILIAIRES
// ============================================================

void afficherEcran(String titre, String ligne1, String ligne2, String ligne3) {
  display.clearDisplay();
  
  display.setTextSize(1);
  display.setTextColor(SH110X_WHITE);
  display.setCursor(0, 0);
  display.println(titre);
  display.drawLine(0, 10, 128, 10, SH110X_WHITE);

  display.setCursor(0, 16);
  display.println(ligne1);

  display.setCursor(0, 32);
  display.println(ligne2);

  display.setCursor(0, 48);
  display.println(ligne3);

  display.display();
}

float mesurerDistance() {
  digitalWrite(TRIG_PIN, LOW);
  delayMicroseconds(2);
  digitalWrite(TRIG_PIN, HIGH);
  delayMicroseconds(10);
  digitalWrite(TRIG_PIN, LOW);

  long duree = pulseIn(ECHO_PIN, HIGH, 25000);
  if (duree == 0) return -1;
  return duree * 0.034 / 2.0;
}

bool nouvelleCarteRFID() {
  if (!rfid.PICC_IsNewCardPresent()) return false;
  if (!rfid.PICC_ReadCardSerial()) return false;
  return true;
}

int verifierCarte() {
  if (rfid.uid.size != 4) return 0;

  bool match1 = true;
  bool match2 = true;

  for (byte i = 0; i < 4; i++) {
    if (rfid.uid.uidByte[i] != UID_CARTE_1[i]) match1 = false;
    if (rfid.uid.uidByte[i] != UID_CARTE_2[i]) match2 = false;
  }

  rfid.PICC_HaltA();

  if (match1) return 1;
  if (match2) return 2;
  return 0;
}

bool boutonAppuye(int pin) {
  if (digitalRead(pin) == LOW) {
    delay(50);
    if (digitalRead(pin) == LOW) {
      while (digitalRead(pin) == LOW) delay(10);
      return true;
    }
  }
  return false;
}

void declencherAlerte() {
  digitalWrite(LED_VERTE, LOW);
  digitalWrite(LED_JAUNE, LOW);

  for (int r = 0; r < 2; r++) {
    digitalWrite(LED_ROUGE, HIGH);
    for (int freq = 1000; freq >= 400; freq -= 20) {
      tone(BUZZER_PIN, freq);
      delay(5);
    }
    digitalWrite(LED_ROUGE, LOW);
    noTone(BUZZER_PIN);
    delay(100);
  }
  digitalWrite(LED_ROUGE, HIGH);
}

void bipSucces() {
  tone(BUZZER_PIN, 2500);
  delay(80);
  noTone(BUZZER_PIN);
  delay(50);
  tone(BUZZER_PIN, 3200);
  delay(120);
  noTone(BUZZER_PIN);
}

void resetBorne() {
  etat = VERROUILLE;
  exploitantActuel = "";
  idExploitantActuel = 0;
  presenceObjet = false;

  digitalWrite(LED_ROUGE, HIGH);
  digitalWrite(LED_JAUNE, LOW);
  digitalWrite(LED_VERTE, LOW);
  noTone(BUZZER_PIN);

  afficherEcran("GEODEX - STATION", "BALANCE VERROUILLEE", "Badger carte RFID", "pour commencer...");
}