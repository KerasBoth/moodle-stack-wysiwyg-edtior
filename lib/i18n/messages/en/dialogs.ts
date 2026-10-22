import type { Messages } from "../../types.ts";

export default {
  saveAs: {
    title: "Save as",
    fileName: "File name",
    exists: "{name} already exists.",
  },
  share: {
    title: "Share “{name}”",
    user: "User",
    chooseUser: "Choose a user…",
    permission: "Permission",
    share: "Share",
    sharedWith: "Shared with",
    removeShare: "Remove access",
    notShared: "Not shared with anyone yet.",
    sharedWithToast: "Shared with {name}",
    roleRead: "Read",
    roleEdit: "Edit",
  },
} satisfies Messages["dialogs"];
