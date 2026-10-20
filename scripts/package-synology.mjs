// Erstellt dist/stack-editor-synology.tar.gz zum Hochladen auf die Synology.
// Enthalten: Quellcode, Dockerfile, docker-compose.yml, .env (Maxima-Server), leerer Ordner data/ und die XML-Aufgaben (Import beim ersten Start).

import { execFileSync } from "node:child_process";
import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const dist = join(root, "dist");
const stage = join(dist, "stack-editor");

const entries = [
  "app", "components", "lib", "scripts", "public",
  "package.json", "package-lock.json", "next.config.mjs", "tsconfig.json",
  "Dockerfile", "docker-compose.yml", ".dockerignore", "README.md", ".env.example",
];

rmSync(dist, { recursive: true, force: true });
mkdirSync(stage, { recursive: true });

for (const e of entries) {
  const src = join(root, e);
  if (!existsSync(src)) continue;
  // public/vendor wird im Container per npm ci neu erzeugt
  cpSync(src, join(stage, e), { recursive: true, filter: (p) => !p.includes(join("public", "vendor")) });
}

// .env für docker-compose: Maxima-Server aus der lokalen Konfiguration übernehmen (nur diese Einstellung)
const localEnv = [".env.local", ".env"].map((f) => join(root, f)).find((f) => existsSync(f));
const maximaUrl = localEnv ? /^MAXIMA_URL=(.*)$/m.exec(readFileSync(localEnv, "utf8"))?.[1]?.trim() : "";
writeFileSync(join(stage, ".env"), [
  "# Einstellungen für docker-compose (Container Manager liest diese Datei automatisch).",
  "# Maxima-Server für Berechnungen, die die lokale Vorschau nicht kann – leer lassen für nur lokal.",
  `MAXIMA_URL=${maximaUrl ?? ""}`,
  "MAXIMA_TIMEOUT=10000",
  "",
  "# Passwort der internen PostgreSQL-Datenbank (nur zwischen den Containern erreichbar).",
  "# Nur vor dem ersten Start ändern – danach muss es gleich bleiben.",
  "# POSTGRES_PASSWORD=stack-editor",
  "",
].join("\n"));

// leerer Datenbankordner, damit Docker ihn nicht mit root-Rechten anlegt
mkdirSync(join(stage, "data"), { recursive: true });
mkdirSync(join(stage, "xml"), { recursive: true });
for (const f of readdirSync(join(root, "xml"))) {
  if (f.toLowerCase().endsWith(".xml")) cpSync(join(root, "xml", f), join(stage, "xml", f));
}

execFileSync("tar", ["-czf", "stack-editor-synology.tar.gz", "stack-editor"], { cwd: dist, stdio: "inherit" });
console.log(`Paket erstellt: ${join(dist, "stack-editor-synology.tar.gz")}`);

// ZIP (lässt sich in der Synology File Station direkt entpacken)
try {
  if (process.platform === "win32") {
    // Windows-eigenes bsdtar (nicht das GNU-tar aus Git-Bash) erzeugt über -a ein ZIP mit "/"-Pfaden
    const bsdtar = join(process.env.SystemRoot ?? "C:\\Windows", "System32", "tar.exe");
    execFileSync(bsdtar, ["-a", "-cf", "stack-editor-synology.zip", "stack-editor"], { cwd: dist, stdio: "inherit" });
  } else {
    execFileSync("zip", ["-qr", "stack-editor-synology.zip", "stack-editor"], { cwd: dist, stdio: "inherit" });
  }
  console.log(`ZIP erstellt:   ${join(dist, "stack-editor-synology.zip")}`);
} catch {
  console.warn("ZIP konnte nicht erstellt werden (zip/tar fehlt) – bitte das .tar.gz verwenden.");
}
console.log(`(entpackter Ordner zum direkten Hochladen: ${stage})`);
