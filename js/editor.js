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
      // očekivani format iz EditorTeksta
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
});
