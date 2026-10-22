import type { Messages } from "../../types.ts";

export default {
  saveAs: {
    title: "Enregistrer sous",
    fileName: "Nom du fichier",
    exists: "{name} existe déjà.",
  },
  share: {
    title: "Partager « {name} »",
    user: "Utilisateur",
    chooseUser: "Choisir un utilisateur…",
    permission: "Droit d’accès",
    share: "Partager",
    sharedWith: "Partagé avec",
    removeShare: "Retirer le partage",
    notShared: "Partagé avec personne pour l’instant.",
    sharedWithToast: "Partagé avec {name}",
    roleRead: "Lecture",
    roleEdit: "Modification",
  },
} satisfies Messages["dialogs"];
