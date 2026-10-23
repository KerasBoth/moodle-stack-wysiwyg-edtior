import type { Messages } from "../../types.ts";
import common from "./common.ts";
import dashboard from "./dashboard.ts";
import dialogs from "./dialogs.ts";
import editor from "./editor.ts";
import formula from "./formula.ts";
import jsx from "./jsx.ts";
import lib from "./lib.ts";
import login from "./login.ts";
import preview from "./preview.ts";
import sections from "./sections.ts";
import server from "./server.ts";
import users from "./users.ts";

export default { common, login, dashboard, users, dialogs, server, editor, preview, sections, jsx, formula, lib } satisfies Messages;
