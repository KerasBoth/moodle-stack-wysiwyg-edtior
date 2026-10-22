import type { Messages } from "../../types.ts";

export default {
  title: "Se connecter",
  setupTitle: "Créer le premier compte",
  setupNote: "Il n’existe encore aucun utilisateur. Le premier compte devient administrateur et peut créer d’autres utilisateurs.",
  username: "Nom d’utilisateur",
  password: "Mot de passe",
  minLength: "8 caractères minimum",
  passwordRepeat: "Confirmer le mot de passe",
  mismatch: "Les mots de passe ne correspondent pas",
  submit: "Se connecter",
  createAccount: "Créer le compte",
  pleaseWait: "Veuillez patienter…",
} satisfies Messages["login"];
