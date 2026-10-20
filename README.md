# STACK-Editor für Moodle

Lokaler Next.js-Editor für Moodle-STACK-Aufgaben (Moodle-XML) mit Code-Vervollständigung, Funktionshilfe und Live-Vorschau inkl. MathJax und JSXGraph.

## Start

```bash
npm install
npm run dev
```

Danach <http://localhost:3000> öffnen. `npm install` kopiert MathJax und JSXGraph nach `public/vendor`, die Vorschau läuft deshalb auch offline.

### Maxima-Server (optional)

Die Vorschau rechnet normalerweise mit einem eigenen Maxima-Nachbau in TypeScript. Für Funktionen, die dieser nicht kann (`solve`, `factor`, `limit` …), lässt sich ein echter Maxima-Server einbinden, wie ihn auch STACK nutzt (goemaxima bzw. MaximaPool). Dafür eine `.env` bzw. `.env.local` anlegen, Vorlage: `.env.example`:

```bash
MAXIMA_URL=https://your-maxima-host/goemaxima
MAXIMA_TIMEOUT=10000          # optional, Millisekunden
MAXIMA_VERSION=2024012900     # optional, STACK-Version für den Server
```

- In der Vorschau-Leiste wählst du **Automatisch** (Maxima nur, wenn die lokale Vorschau etwas nicht kann), **Immer Maxima** oder **Nur lokal**. Eine Markierung zeigt, womit gerade gerechnet wurde.
- Mit Maxima werden die Fragevariablen mit `stack_randseed(seed)` ausgewertet. Die Zufallswerte entsprechen damit denen in Moodle. `{@…@}` erscheint mit der LaTeX-Ausgabe von Maxima (`tex1`), Fehler stehen je Anweisung unter „Probleme“.
- Antworttests in den Rückmeldebäumen und die Eingabevalidierung laufen weiterhin lokal, aber mit den Maxima-Werten.
- Ist der Server nicht erreichbar, bleibt die lokale Vorschau aktiv, und ein Hinweis nennt den Grund.
- Die Anfragen laufen über den eigenen Server (`/api/maxima`, nur angemeldet). Die Adresse des Maxima-Servers gelangt nicht in den Browser.

### Anmeldung und Datenbank

Benutzer, Kategorien und XML-Dateien liegen in einer Datenbank:

- **PostgreSQL**, sobald `DATABASE_URL` gesetzt ist. Im Docker-Compose geschieht das automatisch, siehe unten.
- **SQLite** ohne `DATABASE_URL`: eine Datei `data/stack-editor.db` (Ordner per `STACK_DATA_DIR`). Das ist praktisch für die lokale Entwicklung ohne Datenbankserver.

Beide verwenden dieselben Abfragen. Startet die App mit einer **leeren** PostgreSQL-Datenbank und findet eine vorhandene `stack-editor.db`, übernimmt sie einmalig deren Benutzer, Kategorien, Aufgaben und Versionen. Die SQLite-Datei bleibt dabei unverändert. Daten ohne Besitzer werden dabei dem Administrator mit der niedrigsten ID zugewiesen.

> **Upgrade-Hinweis:** Beim ersten Start nach dem Update werden **alle vorhandenen Aufgaben und Kategorien dem Administrator mit der niedrigsten ID zugewiesen**. Alle anderen Benutzer sehen danach ein leeres Dashboard, bis dieser Administrator Aufgaben mit ihnen teilt.

- **Erster Start:** Gibt es noch keinen Benutzer, legt die Anmeldeseite das erste Konto an. Dieses Konto ist Administrator. Alternativ legen `ADMIN_USER` und `ADMIN_PASSWORD` das Konto beim Start automatisch an.
- **Weitere Benutzer** legen Administratoren über das Benutzermenü oben rechts an (*Benutzerverwaltung*). Dort lassen sich auch Passwörter zurücksetzen und optionale Vor- und Nachnamen pflegen. Jeder Benutzer kann sein eigenes Passwort ändern. Beim Löschen eines Benutzers werden auch seine Aufgaben, Kategorien und Freigaben gelöscht, ebenso für Personen, mit denen er Aufgaben geteilt hat.
- **Private Bereiche:** Jeder Benutzer sieht nur seine eigenen Aufgaben und Kategorien sowie die mit ihm geteilten Aufgaben. Das gilt auch für Administratoren: Ihre Rechte beschränken sich auf die Benutzerverwaltung.
- **Teilen:** Der Besitzer teilt eine Aufgabe mit Benutzern aus einer Liste, entweder als „Lesen“ (ansehen und herunterladen) oder „Bearbeiten“ (Inhalt ändern, aber nicht umbenennen, verschieben, löschen oder weiterteilen). Geteilte Aufgaben erscheinen unter „Mit mir geteilt“.
- **Alte XML-Dateien:** Beim Anlegen der Datenbank werden alle `*.xml` aus `xml/` (bzw. `STACK_XML_DIR`) einmalig in die Kategorie „Importiert“ übernommen.
- **Versionen:** Beim Speichern bleiben die letzten 20 Fassungen jeder Datei in der Tabelle `file_versions` erhalten. Sie ersetzen die früheren `.bak`-Dateien.
- **Gleichzeitiges Bearbeiten:** Hat jemand anderes die Datei inzwischen gespeichert, fragt der Editor vor dem Überschreiben nach.
- **Sicherung (SQLite):** Für ein Backup genügt der Ordner `data/`. Die Datei sollte dabei nicht gerade beschrieben werden, am einfachsten also bei gestopptem Container. Die Sicherung mit PostgreSQL steht im Abschnitt „Betrieb mit Docker“.

## Betrieb mit Docker / Synology Container Manager

`docker-compose.yml` startet zwei Container:

- **`db`**: PostgreSQL 17. Der Container hat **keinen Port nach außen** und liegt nur im internen Netz `backend`. Erreichbar ist er ausschließlich für den App-Container. Die Daten liegen im Docker-Volume `pgdata`.
- **`stack-editor`**: die App (Next.js-Standalone-Server, Node 22, Alpine) auf Port 3000. Sie startet erst, wenn die Datenbank bereit ist, und verbindet sich über `DATABASE_URL=postgres://stack:…@db:5432/stack_editor`.

Die Ordner `xml/` und `data/` sind nur noch für den ersten Start da: Eine SQLite-Datenbank der Vorversion (`data/stack-editor.db`) wird übernommen, sonst werden die XML-Dateien importiert.

1. Upload-Paket erstellen: `npm run package:synology`. Das ergibt `dist/stack-editor-synology.tar.gz`, alternativ lässt sich der Ordner `dist/stack-editor` direkt verwenden.
2. In der **File Station** z. B. nach `/docker/stack-editor` hochladen und entpacken. Dort liegen dann `docker-compose.yml`, `Dockerfile`, `data/` und `xml/`.
3. Im **Container Manager**: *Projekt* → *Erstellen* → Projektname `stack-editor`, Pfad `/docker/stack-editor`. Die vorhandene `docker-compose.yml` verwenden und erstellen. Der erste Build dauert einige Minuten.
4. Die App öffnen: `http://<NAS-IP>:3000` und das erste Administratorkonto anlegen.

**Datenbank-Passwort:** Standardmäßig `stack-editor`. Da die Datenbank von außen nicht erreichbar ist, genügt das. Ein eigenes Passwort trägst du **vor dem ersten Start** als `POSTGRES_PASSWORD=…` in die `.env` ein. PostgreSQL übernimmt es nur beim Anlegen der Datenbank.

**Sicherung:** `docker exec stack-editor-db pg_dump -U stack stack_editor > stack-editor-backup.sql` (per SSH auf der Synology). Zurückspielen in eine leere Datenbank: `docker exec -i stack-editor-db psql -U stack stack_editor < stack-editor-backup.sql`.

**Maxima-Server:** Der Container Manager liest die Datei `.env` im Projektordner, z. B. `MAXIMA_URL=https://…/goemaxima`. Das Paket übernimmt dafür den Wert aus der lokalen `.env.local`. Nach einer Änderung das Projekt neu starten. Leer lassen heißt: nur lokale Vorschau.

**Leserechte:** Der App-Container läuft als Benutzer `node` (UID 1000) und muss `data/` und `xml/` lesen können. Fehlen die Rechte, gibt es zwei Wege:
- In der File Station dem Ordner `data` Lese- und Schreibrechte für *Everyone* geben.
- In `docker-compose.yml` die Zeile `user: "UID:GID"` deines Synology-Benutzers aktivieren. Die Werte liefert per SSH `id <benutzer>`, typisch ist `1026:100`.

Den Port änderst du in `docker-compose.yml` unter `ports`, z. B. `"8090:3000"`. Nach einem Update der Dateien im Container Manager das Projekt neu erstellen bzw. das Image neu bauen.

Lokal mit Docker: `docker compose up -d --build`.

## Funktionen

- **Dashboard** (Startseite nach der Anmeldung):
  - Zuletzt bearbeitete Aufgaben mit Fragename, Kategorie, Bearbeiter und Zeitpunkt.
  - Kategorien anlegen, umbenennen und löschen. Beim Löschen bleiben die Aufgaben erhalten und stehen danach unter „Ohne Kategorie“.
  - Jede Kategorie zeigt ihre ersten 5 Aufgaben (zuletzt bearbeitete zuerst). „Alle anzeigen“ klappt den Rest auf.
  - Pro Kategorie gibt es „Neue Aufgabe“ und „XML hochladen“ (mehrere Dateien möglich).
  - Suche über Datei- und Fragenamen.
- **Kategorien im Editor**: Die Auswahl in der Kopfleiste ordnet die geöffnete Datei sofort einer Kategorie zu.
- **Speichern ohne Rückfrage**: „Speichern“ (Strg+S) benennt neue Aufgaben automatisch nach dem Aufgabentitel und nummeriert sie bei gleichem Namen durch (-2, -3), statt eine vorhandene Datei zu überschreiben. „Speichern unter …“ im Burger-Menü speichert eine Kopie unter einem frei gewählten Namen. Den Dateinamen kann der Besitzer unter „Allgemein“ umbenennen.
- **In-App-Dialoge**: Alle Bestätigungen und Eingaben erscheinen als Dialoge in der Anwendung, nicht als Browser-Popups.
- **XML-Import/-Export**: Dateien aus der Datenbank öffnen, hochladen oder per Drag & Drop laden. Dateien mit mehreren Fragen werden unterstützt. Unbekannte Elemente bleiben beim Speichern unverändert erhalten.
- **Maxima-Editor** (Fragevariablen, Feedback-Variablen, Musterlösungen, PRT-Knoten):
  - Autovervollständigung für etwa 140 STACK- und Maxima-Funktionen und für eigene Variablen, jeweils mit ihrem aktuellen Wert.
  - Hilfe beim Überfahren mit der Maus: Signatur, Beschreibung, Rückgabewert und Beispiel.
  - Signaturhilfe beim Tippen, die den aktiven Parameter hervorhebt.
  - Linting für Syntaxfehler, Auswertungsfehler und fehlende Semikolons.
- **CASText-Editor** (Fragetext, Feedback). Eine Frage öffnet immer im HTML-Modus; ein Wechsel zu „Text“ gilt bis zum Neuladen der Seite. `{@`/`{#` werden automatisch zu `{@…@}`/`{#…#}` geschlossen: HTML-Modus mit hervorgehobenen `{@…@}`, `{#…#}`, `[[input:…]]` und Blöcken. Vervollständigung für Platzhalter, Blöcke (`[[if]]`, `[[jsxgraph]]` …) und LaTeX. Eine Werkzeugleiste fügt Platzhalter und Formeln ein.
- **Live-Vorschau**:
  - Aufgabe im Moodle-Stil mit MathJax 3 und JSXGraph, einschließlich `stack_jxg.bind_*`.
  - Wechsel zwischen Varianten über den Seed.
  - Live-Validierung der Eingaben, „Prüfen“ mit Auswertung aller PRTs und Punkten.
  - „Musterlösung einsetzen“ trägt die Lösung in alle Felder ein.
  - Tabs mit Variablentabelle, Problemliste und Fragetests.
- **Grafik-Editor (JSXGraph)**: Der Button „Grafik“ in der Leiste des Fragetexts öffnet einen Dialog mit Live-Vorschau.
  - Die Zeichenfläche lässt sich einstellen: Größe, x-/y-Bereich, Achsen, Gitter, Seitenverhältnis.
  - Als Elemente gibt es Punkte, Schieberegler, Funktionsgraphen, Strecken/Geraden/Pfeile und Texte.
  - Werte und Terme stehen in Maxima-Schreibweise (`a*(x-1)^2`, `sqrt(x)`). Erlaubt sind auch Reglernamen, Punktkoordinaten (`A_x`) und `{#var#}`. Ein Punkt mit `x = a` folgt dem Regler `a`.
  - Punkte und Regler lassen sich mit einer vorhandenen oder einer neuen Eingabe verbinden. Der Editor ergänzt `input-ref-…` und `stack_jxg.bind_*` (mehrere Objekte an derselben Eingabe als `bind_list_of`).
  - Neue Eingaben legt der Editor an und fügt ihr Eingabefeld (auf Wunsch versteckt) hinter der Grafik ein.
  - In der Vorschau lassen sich Elemente mit der Maus ziehen, die Werte werden übernommen: Punkte (x/y), Regler (Knopf → Startwert, Endpunkte oder Linie → Position) und Funktionsgraphen (Verschiebung x/y, im Code `f(x - dx) + dy`). Felder mit Termen wie `a+1` bleiben dabei unverändert.
  - Steht der Cursor in einer Grafik, öffnet „Grafik“ diese zum Bearbeiten. Im Text-Modus genügt ein Doppelklick auf den Grafik-Baustein. Der Editor liest dabei den **aktuellen Code** ein, also auch von Hand geschriebene oder nachträglich von Hand geänderte Grafiken: `initBoard`, Punkte, Regler, Funktionsgraphen, Strecken/Geraden, Texte und `stack_jxg.bind_*`. Was er nicht erkennt, bleibt als „Eigener Code“ unverändert erhalten, ebenso nötige `input-ref`s.
  - Elemente der Art „Eigener Code“ lassen sich auch selbst anlegen, für alles, was der Editor nicht als Formular anbietet.
- **Rückmeldebäume grafisch**:
  - Die „Übersicht“ zeigt, welche Teilaufgabe und Eingabe in welchem PRT ausgewertet wird. Die Reihenfolge entspricht dem Fragetext.
  - Eingaben ohne PRT und PRTs ohne Eingabe werden markiert.
  - In „Bearbeiten“ sind die PRTs als Tabs angeordnet. Ein Klick öffnet einen PRT. Über das Häkchen, Strg+Klick oder Umschalt+Klick (Bereich) öffnest du mehrere untereinander, „Alle öffnen“ zeigt alle.
  - SAns und TAns haben eine Auswahlliste. SAns bietet die Eingaben und die Feedback-Variablen an, TAns die Musterlösungen der Eingaben, die Fragevariablen samt aktuellem Wert und die Feedback-Variablen. Freier Text bleibt möglich.
  - Jeder PRT wird als Baum mit wahr/falsch-Zweigen, Rückverweisen und Endpunkten samt Punkten dargestellt. Ein Klick auf einen Knoten öffnet seine Einstellungen.
- **Editoren für Eingaben, PRTs, Optionen, Fragetests und Varianten**. Eingaben und Rückmeldebäume sind als Tabs angeordnet: Klick öffnet einen Eintrag, Häkchen, Strg+Klick oder Umschalt+Klick öffnen mehrere. Beim Umbenennen von Eingaben oder PRTs werden alle Verweise angepasst.
- **Kopfleiste**: Die Kopfleiste zeigt nur Datei, Kategorie, „Speichern“ und das Benutzermenü. Alle weiteren Aktionen stehen im Burger-Menü links: neue Aufgabe, XML hochladen, Speichern unter …, Speichern & Download, XML kopieren, Kategorie, Funktionsreferenz, Vorschau und zuletzt bearbeitete Dateien.
- **Funktionsreferenz** (im Burger-Menü) mit Suche, Kategorien, Antworttests und CASText-Blöcken. „Einfügen“ setzt den Eintrag in den zuletzt benutzten Editor ein.

Tastenkürzel: `Strg+S` speichert, `Strg+Umschalt+S` speichert und lädt die XML-Datei herunter, `Strg+Leertaste` öffnet die Vervollständigung.

## Grenzen der Vorschau

Die Vorschau rechnet mit einem eigenen Maxima-Nachbau in TypeScript (`lib/maxima`), nicht mit dem echten CAS:

- Abgedeckt sind die in STACK-Aufgaben üblichen Funktionen: `rand*`, Listen und Mengen, `if`/`block`/`makelist`, `diff`, `expand`, `subst`, `ev`, einfache `integrate`, Strings und MCQ-Hilfen. Nicht ausgewertet werden u. a. `solve`, `factor` und `limit`. Bei solchen Funktionen erscheint ein Hinweis.
- Antworttests werden näherungsweise geprüft. `AlgEquiv` vergleicht zum Beispiel numerisch an Stichprobenpunkten.
- Der Zufallsgenerator weicht von Maxima ab. Ein Seed liefert hier andere Werte als in Moodle.

Maßgeblich bleibt deshalb das Verhalten in Moodle. Die Vorschau ist für schnelles Iterieren gedacht. Mit einem Maxima-Server (siehe oben) entfallen die ersten und letzten Einschränkungen für Fragevariablen und `{@…@}`.

## Projektstruktur

```
app/                 Next.js App Router: / (Dashboard), /editor, /login, API unter /api/*
components/          UI (Dashboard, Login, Benutzermenü, Editor-App, Vorschau, Referenz, Abschnitte, CodeMirror-Wrapper)
lib/server/          Datenbank (PostgreSQL/SQLite), Datenzugriff, Passwort-Hashing, Sitzungen, Maxima-Anbindung
lib/client/          fetch-Helfer für die API
lib/maxima/          Parser, Vereinfacher, Auswerter, LaTeX-/Text-Ausgabe
lib/stack/           XML-Modell, CASText-Renderer, Antworttests, Vorschau, Funktionsdoku
lib/editor/          CodeMirror-Erweiterungen (Sprache, Vervollständigung, Hover, Lint)
tests/               node:test-Tests (npm test)
data/                SQLite-Datenbank für die lokale Entwicklung (nicht im Git)
xml/                 alte XML-Aufgaben (Import beim ersten Start)
```

```bash
npm test          # Engine-, XML-Round-Trip-, Vorschau- und Datenbank-Tests (SQLite und ein eingebetteter PostgreSQL-Server)
npm run typecheck
```
