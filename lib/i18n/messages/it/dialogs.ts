import type { Messages } from "../../types.ts";

export default {
  saveAs: {
    title: "Salva con nome",
    fileName: "Nome del file",
    exists: "{name} esiste già.",
  },
  share: {
    title: "Condividi «{name}»",
    user: "Utente",
    chooseUser: "Scegli un utente…",
    permission: "Permesso",
    share: "Condividi",
    sharedWith: "Condiviso con",
    removeShare: "Rimuovi condivisione",
    notShared: "Non ancora condiviso con nessuno.",
    sharedWithToast: "Condiviso con {name}",
    roleRead: "Lettura",
    roleEdit: "Modifica",
  },
} satisfies Messages["dialogs"];
