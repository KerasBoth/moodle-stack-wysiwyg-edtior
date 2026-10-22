import type { Messages } from "../../types.ts";

export default {
  saveAs: {
    title: "Guardar como",
    fileName: "Nombre del archivo",
    exists: "{name} ya existe.",
  },
  share: {
    title: "Compartir «{name}»",
    user: "Usuario",
    chooseUser: "Elegir usuario…",
    permission: "Permiso",
    share: "Compartir",
    sharedWith: "Compartido con",
    removeShare: "Quitar acceso",
    notShared: "Todavía no se ha compartido con nadie.",
    sharedWithToast: "Compartido con {name}",
    roleRead: "Lectura",
    roleEdit: "Edición",
  },
} satisfies Messages["dialogs"];
