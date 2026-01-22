document.addEventListener("DOMContentLoaded", function () {
  const div = document.getElementById("divEditor");
  const poruke = document.getElementById("poruke");

  if (!div) {
    console.error("Nije pronađen divEditor");
    return;
  }

  function ispisiPoruku(msg, type = "") {
    if (poruke) {
      poruke.textContent = typeof msg === "string" ? msg : JSON.stringify(msg, null, 2);
      
      poruke.className = "poruke";
      
      if (type) {
        poruke.classList.add(type);
      }
    } else {
      console.log(msg);
    }
  }

  let editor;
  try {
    editor = EditorTeksta(div);
  } catch (e) {
    ispisiPoruku(e.message, "error");
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
          `Ukupno: ${rez.ukupno}, boldiranih: ${rez.boldiranih}, italic: ${rez.italic}`,
          "success"
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
          ispisiPoruku("Nema potencijalno pogrešno napisanih uloga.", "success");
        } else {
          ispisiPoruku("Potencijalno pogrešne uloge:\n- " + r.join("\n- "), "warning");
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
        ispisiPoruku("Unesi ulogu za broj linija (npr. ALICE).", "warning");
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
        ispisiPoruku("Unesi ulogu za scenarij (npr. ALICE).", "warning");
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
      if (!ok) ispisiPoruku("Nema validne selekcije za bold.", "warning");
    });
  }

  let btnItalic = document.getElementById("btnItalic");
  if (btnItalic) {
    btnItalic.addEventListener("click", function () {
      let ok = editor.formatirajTekst("italic");
      if (!ok) ispisiPoruku("Nema validne selekcije za italic.", "warning");
    });
  }

  let btnUnderline = document.getElementById("btnUnderline");
  if (btnUnderline) {
    btnUnderline.addEventListener("click", function () {
      let ok = editor.formatirajTekst("underline");
      if (!ok) ispisiPoruku("Nema validne selekcije za underline.", "warning");
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

  if (params.get("scenarioId")) {
    localStorage.setItem("scenarioId", String(scenarioId));
  }
  if (params.get("userId")) {
    localStorage.setItem("userId", String(userId));
  }

  const topbarTitle = document.querySelector(".project-title");
  if (topbarTitle) {
    topbarTitle.textContent = `📝 Scenario #${scenarioId} | 👤 User #${userId}`;
  }

  const draftKey = `draft:${scenarioId}:${userId}`;

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
  let isLoadingScenario = false;
  let isLineLocked = false;

  function renderScenario(sc) {
    const text = (sc.content || []).map((l) => l.text ?? "").join("\n");
    div.setAttribute("contenteditable", "true");
    div.style.whiteSpace = "pre-wrap";
    div.textContent = text;
  }

  function loadScenario() {
    if (isLoadingScenario) return;
    isLoadingScenario = true;

    PoziviAjaxFetch.getScenario(scenarioId, (status, data) => {
      isLoadingScenario = false;

      if (status !== 200) {
        ispisiPoruku("❌ " + (data?.message || "Greška pri učitavanju scenarija."), "error");
        return;
      }

      const currentDraft = loadDraft();
      if (currentDraft !== null && currentDraft.trim().length > 0) {
        ispisiPoruku(
          `✅ Scenarij #${data.id}: "${data.title}". Imaš draft koji nije poslan.`,
          "warning"
        );
      } else {
        renderScenario(data);
        ispisiPoruku(`✅ Učitan scenarij #${data.id}: "${data.title}"`, "success");
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
      "⚠️ Vraćen lokalni draft. Klikni 🔒 LOCK LINE pa SPASI.",
      "warning"
    );
  } else {
    loadScenario();
  }

  const btnLockLine = document.getElementById("btnLockLine");
  if (btnLockLine) {
    btnLockLine.addEventListener("click", function () {
      const lineId = 1;

      ispisiPoruku(`🔒 Pokušavam zaključati liniju ${lineId}...`, "info");

      PoziviAjaxFetch.lockLine(scenarioId, lineId, userId, (status, data) => {
        if (status === 200) {
          ispisiPoruku(`✅ ${data?.message || "Linija uspješno zaključana!"}`, "success");
          isLineLocked = true;
          btnLockLine.disabled = true;
          btnLockLine.textContent = "🔒 LOCKED";
        } else if (status === 409) {
          ispisiPoruku(`❌ KONFLIKT: ${data?.message || "Linija već zaključana!"}`, "error");
        } else if (status === 404) {
          ispisiPoruku(`❌ ${data?.message || "Linija ne postoji!"}`, "error");
        } else {
          ispisiPoruku(`❌ Greška: ${data?.message || "Nepoznata greška"}`, "error");
        }
      });
    });
  }

  const btnSave = document.querySelector(".save-btn");
  if (btnSave) {
    btnSave.addEventListener("click", function () {
      const lineId = 1;

      if (!isLineLocked) {
        ispisiPoruku("⚠️ Moraš prvo ZAKLJUČATI liniju!", "warning");
        return;
      }

      const original = div.innerText ?? "";
      const normalized = normalizeRoles(original);
      const newTextArr = normalized.split(/\r?\n/);

      const hasAnyNonEmpty = newTextArr.some((l) => l.trim().length > 0);
      if (!hasAnyNonEmpty) {
        ispisiPoruku("❌ Ne možeš spasiti prazan sadržaj.", "error");
        return;
      }

      ispisiPoruku("💾 Šaljem izmjene...", "info");

      PoziviAjaxFetch.updateLine(
        scenarioId,
        lineId,
        userId,
        newTextArr,
        (status, data) => {
          if (status === 200) {
            clearDraft();
            ispisiPoruku(`✅ ${data?.message || "Linija ažurirana!"}`, "success");
            isLineLocked = false;
            if (btnLockLine) {
              btnLockLine.disabled = false;
              btnLockLine.textContent = "🔒 LOCK LINE #1";
            }
            
            setTimeout(() => loadScenario(), 500);
          } else if (status === 409) {
            ispisiPoruku(`❌ KONFLIKT: ${data?.message}`, "error");
          } else if (status === 404) {
            ispisiPoruku(`❌ ${data?.message}`, "error");
          } else if (status === 400) {
            ispisiPoruku(`❌ ${data?.message}`, "error");
          } else {
            ispisiPoruku(`❌ Greška: ${data?.message}`, "error");
          }
        }
      );
    });
  }

  const charNameInput = document.getElementById("charNameInput");
  const btnLockChar = document.getElementById("btnLockChar");
  const charOldName = document.getElementById("charOldName");
  const charNewName = document.getElementById("charNewName");
  const btnUpdateChar = document.getElementById("btnUpdateChar");

  let currentCharLock = null;

  if (btnLockChar) {
    btnLockChar.addEventListener("click", () => {
      const charName = (charNameInput.value || "").trim().toUpperCase();
      if (!charName) {
        ispisiPoruku("❌ Unesi ime lika!", "warning");
        return;
      }

      ispisiPoruku(`🔒 Zaključavam: ${charName}...`, "info");

      PoziviAjaxFetch.lockCharacter(scenarioId, charName, userId, (status, data) => {
        if (status === 200) {
          ispisiPoruku(`✅ ${data?.message}`, "success");
          currentCharLock = charName;
          btnUpdateChar.disabled = false;
          charOldName.value = charName;
          btnLockChar.disabled = true;
        } else if (status === 409) {
          ispisiPoruku(`❌ KONFLIKT: ${data?.message}`, "error");
        } else if (status === 404) {
          ispisiPoruku(`❌ ${data?.message}`, "error");
        } else {
          ispisiPoruku(`❌ ${data?.message}`, "error");
        }
      });
    });
  }

  if (btnUpdateChar) {
    btnUpdateChar.addEventListener("click", () => {
      const oldName = (charOldName.value || "").trim().toUpperCase();
      const newName = (charNewName.value || "").trim().toUpperCase();

      if (!oldName || !newName) {
        ispisiPoruku("❌ Unesi oba imena!", "warning");
        return;
      }

      if (!currentCharLock || currentCharLock !== oldName) {
        ispisiPoruku("⚠️ Prvo zaključaj staro ime!", "warning");
        return;
      }

      ispisiPoruku(`✏️ ${oldName} → ${newName}...`, "info");

      PoziviAjaxFetch.updateCharacter(scenarioId, userId, oldName, newName, (status, data) => {
        if (status === 200) {
          ispisiPoruku(`✅ ${data?.message}`, "success");
          currentCharLock = null;
          btnUpdateChar.disabled = true;
          btnLockChar.disabled = false;
          charNameInput.value = "";
          charOldName.value = "";
          charNewName.value = "";
          
          setTimeout(() => loadScenario(), 500);
        } else if (status === 409) {
          ispisiPoruku(`❌ KONFLIKT: ${data?.message}`, "error");
        } else if (status === 404) {
          ispisiPoruku(`❌ ${data?.message}`, "error");
        } else {
          ispisiPoruku(`❌ ${data?.message}`, "error");
        }
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

      ispisiPoruku(
        `🔄 NOVA DELTA: ${deltas.length} promjena. Osvježi stranicu!`,
        "info"
      );
    });
  }, 3000);
});