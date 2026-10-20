// MathJax im Hauptdokument für die gesetzte Ansicht der Formel-Kästchen im Texteditor. Unabhängig von der Vorschau:
// Der Vorschau-iframe (lib/stack/frame.ts) lädt sein eigenes MathJax in seinem eigenen Fenster.

const SRC = "/vendor/mathjax/tex-svg.js";

interface MathJaxApi {
  startup: { promise: Promise<unknown> };
  tex2svgPromise(tex: string, options: { display: boolean }): Promise<HTMLElement>;
  svgStylesheet(): HTMLElement;
}

let loading: Promise<MathJaxApi> | null = null;
// MathJax rendert nacheinander (Autoload von Erweiterungen wie \bbox, \color, \unicode läuft über Wiederholungen).
let queue: Promise<unknown> = Promise.resolve();

function loadMathJax(): Promise<MathJaxApi> {
  if (typeof window === "undefined") return Promise.reject(new Error("MathJax nur im Browser"));
  loading ??= new Promise<MathJaxApi>((resolve, reject) => {
    const w = window as unknown as { MathJax?: unknown };
    // \bbox, \color und \unicode lädt das Autoload von tex-svg.js bei Bedarf aus /vendor/mathjax/input/tex/extensions/.
    w.MathJax = { startup: { typeset: false }, svg: { fontCache: "local" }, tex: {} };
    const script = document.createElement("script");
    script.src = SRC;
    script.async = true;
    script.onerror = () => reject(new Error("MathJax konnte nicht geladen werden"));
    script.onload = () => {
      const mj = w.MathJax as MathJaxApi | undefined;
      if (!mj?.startup?.promise) { reject(new Error("MathJax konnte nicht gestartet werden")); return; }
      mj.startup.promise.then(() => {
        if (!document.getElementById("MJX-SVG-styles")) document.head.appendChild(mj.svgStylesheet());
        resolve(mj);
      }, reject);
    };
    document.head.appendChild(script);
  });
  return loading;
}

/** TeX → gesetzte Formel (mjx-container mit SVG). Lehnt ab bei Ladefehler oder TeX-Fehler. */
export function renderTex(tex: string, display: boolean): Promise<SVGElement | HTMLElement> {
  return loadMathJax().then((mj) => {
    const next = queue.then(() => mj.tex2svgPromise(tex, { display }));
    queue = next.catch(() => undefined);
    return next;
  }).then((node) => {
    const error = node.querySelector('[data-mml-node="merror"]');
    if (error) throw new Error(error.getAttribute("data-mjx-error") ?? "TeX-Fehler");
    return node;
  });
}
