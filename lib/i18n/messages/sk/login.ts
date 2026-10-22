import type { Messages } from "../../types.ts";

export default {
  title: "Prihlásiť sa",
  setupTitle: "Vytvoriť prvé konto",
  setupNote: "Zatiaľ neexistuje žiadny používateľ. Prvé konto bude mať práva administrátora a môže vytvárať ďalších používateľov.",
  username: "Používateľské meno",
  password: "Heslo",
  minLength: "aspoň 8 znakov",
  passwordRepeat: "Zopakovať heslo",
  mismatch: "Heslá sa nezhodujú",
  submit: "Prihlásiť sa",
  createAccount: "Vytvoriť konto",
  pleaseWait: "Čakajte, prosím…",
} satisfies Messages["login"];
