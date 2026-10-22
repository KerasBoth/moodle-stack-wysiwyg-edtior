import type { Messages } from "../../types.ts";

export default {
  title: "Accedi",
  setupTitle: "Crea il primo account",
  setupNote: "Non esiste ancora nessun utente. Il primo account diventa amministratore e può creare altri utenti.",
  username: "Nome utente",
  password: "Password",
  minLength: "almeno 8 caratteri",
  passwordRepeat: "Ripeti la password",
  mismatch: "Le password non coincidono",
  submit: "Accedi",
  createAccount: "Crea account",
  pleaseWait: "Attendere…",
} satisfies Messages["login"];
