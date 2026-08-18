#define RED_PIN 9
#define GREEN_PIN 10
#define BLUE_PIN 11
#define BUTTON_PIN 6

void setup() {
  Serial.begin(9600);
  pinMode(RED_PIN, OUTPUT);
  pinMode(GREEN_PIN, OUTPUT);
  pinMode(BLUE_PIN, OUTPUT);
  pinMode(BUTTON_PIN, INPUT_PULLUP); 
  setColor(0, 0, 0); 
}

void loop() {
  if (digitalRead(BUTTON_PIN) == LOW) {
    Serial.println("S"); 
    delay(500);          
  }

  if (Serial.available() > 0) {
    char commande = Serial.read();
    switch (commande) {
      case 'V': setColor(0, 255, 0); break;
      case 'R': setColor(255, 0, 0); break;
      case 'B': setColor(0, 0, 255); break;
      case 'E': setColor(0, 0, 0); break;
    }
  }
}

void setColor(int red, int green, int blue) {
  analogWrite(RED_PIN, red);
  analogWrite(GREEN_PIN, green);
  analogWrite(BLUE_PIN, blue);
}