// Anzeige von Personen – ohne Server-Importe, auch im Client nutzbar.

export interface Person { id: number; username: string; firstName: string; lastName: string }

type Named = { username: string; firstName: string; lastName: string };
const fullName = (p: Named) => `${p.firstName} ${p.lastName}`.trim();

/** „Vorname Nachname“, bei leeren Namen der Benutzername. */
export function personName(p: Named): string {
  return fullName(p) || p.username;
}

/** „Vorname Nachname (benutzername)“, bei leeren Namen der Benutzername. */
export function personLabel(p: Named): string {
  const name = fullName(p);
  return name ? `${name} (${p.username})` : p.username;
}
