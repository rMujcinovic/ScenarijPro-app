document.addEventListener("DOMContentLoaded", function () {
  const div = document.getElementById("divEditor");
  const poruke = document.getElementById("poruke");

  if (!div) {
    console.error("Nije pronađen divEditor");
    return;
  }

  function ispisiPoruku(msg) {
    if (poruke) {
      poruke.textContent =
        typeof msg === "string" ? msg : JSON.stringify(msg, null, 2);
    } else {
      console.log(msg);
    }
  }

  let editor;
  try {
    editor = EditorTeksta(div);
  } catch (e) {
    ispisiPoruku(e.message);
    return;
  }

  function normalizeRoles(text) {
    const lines = String(text ?? "").split(/\r?\n/);
    const out = [];

    for (const line of lines) {
      const t = line.trim();
      const m = /^([A-ZČĆŠĐŽ]+(?: [A-ZČĆŠĐŽ]+)*):\s*(.*)$/.exec(t);

      if (m) {
        const role = m[1].trim();
        const rest = m[2] ?? "";
        out.push(role);
        out.push(rest);
      } else {
        out.push(line);
      }
    }
    return out.join("\n");
  }

  function withNormalizedDomText(fn) {
    const original = div.innerText ?? "";
    const normalized = normalizeRoles(original);

    if (normalized !== original) div.innerText = normalized;
    try {
      return fn();
    } finally {
      if (normalized !== original) div.innerText = original;
    }
  }

  let btnBrojRijeci = document.getElementById("btnBrojRijeci");
  if (btnBrojRijeci) {
    btnBrojRijeci.addEventListener("click", function () {
      const rez = withNormalizedDomText(() => editor.dajBrojRijeci());
      if (rez && typeof rez === "object" && "ukupno" in rez) {
        ispisiPoruku(
          `Ukupno: ${rez.ukupno}, boldiranih: ${rez.boldiranih}, italic: ${rez.italic}`
        );
      } else {
        ispisiPoruku(rez);
      }
    });
  }

  let btnUloge = document.getElementById("btnUloge");
  if (btnUloge) {
    btnUloge.addEventListener("click", function () {
      const uloge = withNormalizedDomText(() => editor.dajUloge());
      ispisiPoruku(uloge);
    });
  }

  let btnPogresne = document.getElementById("btnPogresneUloge");
  if (btnPogresne) {
    btnPogresne.addEventListener("click", function () {
      const r = withNormalizedDomText(() => editor.pogresnaUloga());

      if (Array.isArray(r)) {
        if (r.length === 0) {
          ispisiPoruku("Nema potencijalno pogrešno napisanih uloga.");
        } else {
          ispisiPoruku("Potencijalno pogrešne uloge:\n- " + r.join("\n- "));
        }
      } else {
        ispisiPoruku(r);
      }
    });
  }

  let btnBrojLinija = document.getElementById("btnBrojLinija");
  let inputUlogaLinije = document.getElementById("inputUlogaLinije");
  if (btnBrojLinija && inputUlogaLinije) {
    btnBrojLinija.addEventListener("click", function () {
      let uloga = (inputUlogaLinije.value || "").trim();
      if (!uloga) {
        ispisiPoruku("Unesi ulogu za broj linija (npr. ALICE).");
        return;
      }
      const br = withNormalizedDomText(() => editor.brojLinijaTeksta(uloga));
      ispisiPoruku(`Uloga ${uloga} ima ukupno ${br} linija teksta.`);
    });
  }

  let btnScenarijUloge = document.getElementById("btnScenarijUloge");
  let inputUlogaScenarij = document.getElementById("inputUlogaScenarij");
  if (btnScenarijUloge && inputUlogaScenarij) {
    btnScenarijUloge.addEventListener("click", function () {
      let uloga = (inputUlogaScenarij.value || "").trim();
      if (!uloga) {
        ispisiPoruku("Unesi ulogu za scenarij (npr. ALICE).");
        return;
      }
      const rez = withNormalizedDomText(() => editor.scenarijUloge(uloga));
      ispisiPoruku(rez);
    });
  }

  let btnGrupe = document.getElementById("btnGrupeUloga");
  if (btnGrupe) {
    btnGrupe.addEventListener("click", function () {
      const rez = withNormalizedDomText(() => editor.grupisiUloge());
      ispisiPoruku(rez);
    });
  }

  let btnBold = document.getElementById("btnBold");
  if (btnBold) {
    btnBold.addEventListener("click", function () {
      let ok = editor.formatirajTekst("bold");
      if (!ok) ispisiPoruku("Nema validne selekcije za bold.");
    });
  }

  let btnItalic = document.getElementById("btnItalic");
  if (btnItalic) {
    btnItalic.addEventListener("click", function () {
      let ok = editor.formatirajTekst("italic");
      if (!ok) ispisiPoruku("Nema validne selekcije za italic.");
    });
  }

  let btnUnderline = document.getElementById("btnUnderline");
  if (btnUnderline) {
    btnUnderline.addEventListener("click", function () {
      let ok = editor.formatirajTekst("underline");
      if (!ok) ispisiPoruku("Nema validne selekcije za underline.");
    });
  }

  if (typeof PoziviAjaxFetch === "undefined") {
    console.warn("PoziviAjaxFetch nije učitan.");
    return;
  }

  const params = new URLSearchParams(window.location.search);
  const scenarioId = parseInt(
    params.get("scenarioId") || localStorage.getItem("scenarioId") || "1",
    10
  );
  const userId = parseInt(
    params.get("userId") || localStorage.getItem("userId") || "1",
    10
  );

  localStorage.setItem("scenarioId", String(scenarioId));
  localStorage.setItem("userId", String(userId));

  const draftKey = `draft:${scenarioId}`;

  function saveDraft() {
    try {
      localStorage.setItem(draftKey, div.innerText ?? "");
    } catch { }
  }

  function loadDraft() {
    try {
      return localStorage.getItem(draftKey);
    } catch {
      return null;
    }
  }

  function clearDraft() {
    try {
      localStorage.removeItem(draftKey);
    } catch { }
  }

  let since = 0;

  function renderScenario(sc) {
    const text = (sc.content || []).map((l) => l.text ?? "").join("\n");
    div.setAttribute("contenteditable", "true");
    div.style.whiteSpace = "pre-wrap";
    div.textContent = text;
  }

  function loadScenario() {
    PoziviAjaxFetch.getScenario(scenarioId, (status, data) => {
      if (status !== 200) {
        ispisiPoruku(data?.message || "Greška pri učitavanju scenarija.");
        return;
      }

      const currentDraft = loadDraft();
      if (currentDraft !== null && currentDraft.trim().length > 0) {
        ispisiPoruku(
          `Učitan scenarij #${data.id}: ${data.title} (server OK). Imaš lokalni draft koji nije poslan.`
        );
      } else {
        renderScenario(data);
        ispisiPoruku(`Učitan scenarij #${data.id}: ${data.title}`);
      }
    });
  }

  div.addEventListener("input", () => {
    saveDraft();
  });

  const draft = loadDraft();
  if (draft !== null && draft.trim().length > 0) {
    div.setAttribute("contenteditable", "true");
    div.style.whiteSpace = "pre-wrap";
    div.textContent = draft;
    ispisiPoruku(
      "Vraćen lokalni draft (nesačuvane izmjene). Klikni SPASI da ih pošalješ na server."
    );
  }

  loadScenario();

  const btnSave = document.querySelector(".save-btn");
  if (btnSave) {
    btnSave.addEventListener("click", function () {
      const lineId = 1;

      const original = div.innerText ?? "";
      const normalized = normalizeRoles(original);
      const newTextArr = normalized.split(/\r?\n/);

      const hasAnyNonEmpty = newTextArr.some((l) => l.trim().length > 0);
      if (!hasAnyNonEmpty) {
        ispisiPoruku("Ne možeš spasiti potpuno prazan sadržaj.");
        return;
      }

      PoziviAjaxFetch.lockLine(scenarioId, lineId, userId, (s1, r1) => {
        if (s1 !== 200) {
          ispisiPoruku(r1?.message || "Ne mogu zaključati liniju.");
          return;
        }

        PoziviAjaxFetch.updateLine(
          scenarioId,
          lineId,
          userId,
          newTextArr,
          (s2, r2) => {
            if (s2 === 200) {
              clearDraft();
              ispisiPoruku(r2?.message || "Linija je uspješno ažurirana!");
              loadScenario();
            } else {
              ispisiPoruku(r2?.message || "Greška pri spremanju.");
            }
          }
        );
      });
    });
  }

  setInterval(() => {
    PoziviAjaxFetch.getDeltas(scenarioId, since, (status, data) => {
      if (status !== 200) return;

      const deltas = data?.deltas || [];
      if (deltas.length === 0) return;

      for (const d of deltas) {
        if (typeof d.timestamp === "number") {
          since = Math.max(since, d.timestamp);
        }
      }

      loadScenario();
    });
  }, 2000);
});
