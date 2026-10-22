# Glossar für die Übersetzung der Oberfläche

Verbindlich für alle Übersetzungen unter `lib/i18n/messages/`. Wortlaut nach den Sprachpaketen von Moodle
(Fragensammlung, Testvorschau) und STACK (`qtype_stack`); wo die Pakete schwanken, gilt die Spalte hier.
Deutsch ist die Quelle. Neue Fachbegriffe zuerst hier eintragen, dann übersetzen.

## Fachbegriffe

| Deutsch | English | Français | Español | Italiano | Slovenčina |
|---|---|---|---|---|---|
| Aufgabe (eine STACK-Frage im Editor) | Question | Question | Pregunta | Domanda | Otázka |
| Frage (Moodle-Fragetyp, Fragensammlung) | Question | Question | Pregunta | Domanda | Otázka |
| Fragetext | Question text | Texte de la question | Texto de la pregunta | Testo della domanda | Text otázky |
| Rückmeldebaum (PRT) | Potential response tree (PRT) | Arbre de réponses potentielles (PRT) | Árbol de respuestas potenciales (PRT) | Albero delle risposte potenziali (PRT) | Strom potenciálnych odpovedí (PRT) |
| Knoten | Node | Nœud | Nodo | Nodo | Uzol |
| Zweig (wahr/falsch) | Branch (true/false) | Branche (vrai/faux) | Rama (verdadero/falso) | Ramo (vero/falso) | Vetva (pravda/nepravda) |
| Antworttest | Answer test | Test de réponse | Prueba de respuesta | Test di risposta | Test odpovede |
| Antwortnotiz | Answer note | Note de réponse | Nota de respuesta | Nota della risposta | Poznámka k odpovedi |
| Eingabe (Input) | Input | Champ de réponse | Campo de respuesta | Campo di risposta | Vstupné pole |
| Eingabetyp | Input type | Type de champ | Tipo de campo | Tipo di campo | Typ vstupu |
| Schülerantwort | Student's answer | Réponse de l'étudiant | Respuesta del estudiante | Risposta dello studente | Odpoveď študenta |
| Lehrerantwort | Teacher's answer | Réponse de l'enseignant | Respuesta del profesor | Risposta del docente | Odpoveď učiteľa |
| Validierung | Validation | Validation | Validación | Validazione | Validácia |
| Fragevariablen | Question variables | Variables de la question | Variables de la pregunta | Variabili della domanda | Premenné otázky |
| Rückmeldevariablen | Feedback variables | Variables de feedback | Variables de retroalimentación | Variabili di feedback | Premenné spätnej väzby |
| Rückmeldung (Feedback) | Feedback | Feedback | Retroalimentación | Feedback | Spätná väzba |
| Allgemeines Feedback | General feedback | Feedback général | Retroalimentación general | Feedback generale | Všeobecná spätná väzba |
| Musterlösung | Worked solution | Solution détaillée | Solución desarrollada | Soluzione svolta | Vzorové riešenie |
| Punkte | Mark | Note | Puntuación | Punteggio | Body |
| Bewertung | Grading | Évaluation | Calificación | Valutazione | Hodnotenie |
| Abzug | Penalty | Pénalité | Penalización | Penalità | Penalizácia |
| Kategorie | Category | Catégorie | Categoría | Categoria | Kategória |
| Teilen | Share | Partager | Compartir | Condividi | Zdieľať |
| Vorschau | Preview | Aperçu | Vista previa | Anteprima | Náhľad |
| Entwurf | Draft | Brouillon | Borrador | Bozza | Koncept |
| Zufallswert (Seed) | Random seed | Graine aléatoire (seed) | Semilla aleatoria (seed) | Seme casuale (seed) | Náhodné semienko (seed) |
| Variante | Variant | Variante | Variante | Variante | Variant |
| Fragetest | Question test | Test de question | Prueba de pregunta | Test della domanda | Test otázky |
| Datei | File | Fichier | Archivo | File | Súbor |
| Benutzer | User | Utilisateur | Usuario | Utente | Používateľ |
| Anmelden | Log in | Se connecter | Iniciar sesión | Accedi | Prihlásiť sa |
| Abmelden | Log out | Se déconnecter | Cerrar sesión | Esci | Odhlásiť sa |

## Nicht übersetzen

STACK, Moodle, Maxima, LaTeX, JSXGraph, MathJax, XML, PRT, Funktionsnamen und Signaturen (`ATAlgEquiv`, `ev(…)`),
Maxima-/LaTeX-Code, XML-Tags, Platzhalter `{name}`.

## Stil

- **Deutsch:** Wortlaut wie bisher in der Oberfläche; Knöpfe als Infinitiv („Speichern“).
- **English:** Sentence case („Save as“, nicht „Save As“); Knöpfe im Imperativ.
- **Français:** Infinitiv für Knöpfe („Enregistrer“); Vouvoiement; geschütztes Leerzeichen vor `: ; ? !`.
- **Español:** Infinitiv für Knöpfe („Guardar“); „usted“-neutral formulieren.
- **Italiano:** Imperativ (2. Person Singular) für Knöpfe wie in Moodle („Salva“, „Annulla“).
- **Slovenčina:** Infinitiv für Knöpfe („Uložiť“); Mehrzahl mit drei Formen (1 / 2–4 / 5+) als `{ one, few, other }`.
- Auslassungspunkte als „…“ mit vorangestelltem Leerzeichen wie im Deutschen („Lädt …“).
