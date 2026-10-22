import type { Messages } from "../../types.ts";

export default {
  saveAs: {
    title: "Uložiť ako",
    fileName: "Názov súboru",
    exists: "{name} už existuje.",
  },
  share: {
    title: "Zdieľať „{name}“",
    user: "Používateľ",
    chooseUser: "Vyberte používateľa…",
    permission: "Oprávnenie",
    share: "Zdieľať",
    sharedWith: "Zdieľané s",
    removeShare: "Zrušiť zdieľanie",
    notShared: "Zatiaľ nie je s nikým zdieľané.",
    sharedWithToast: "Zdieľané s používateľom {name}",
    roleRead: "Čítanie",
    roleEdit: "Úpravy",
  },
} satisfies Messages["dialogs"];
