import type { Messages } from "../../types.ts";

export default {
  title: "Log in",
  setupTitle: "Create the first account",
  setupNote: "There are no users yet. The first account becomes an administrator and can create further users.",
  username: "Username",
  password: "Password",
  minLength: "at least 8 characters",
  passwordRepeat: "Repeat password",
  mismatch: "The passwords do not match",
  submit: "Log in",
  createAccount: "Create account",
  pleaseWait: "Please wait…",
} satisfies Messages["login"];
