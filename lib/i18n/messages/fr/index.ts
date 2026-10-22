import type { Messages } from "../../types.ts";
import common from "./common.ts";
import dashboard from "./dashboard.ts";
import dialogs from "./dialogs.ts";
import login from "./login.ts";
import server from "./server.ts";
import users from "./users.ts";

export default { common, login, dashboard, users, dialogs, server } satisfies Messages;
