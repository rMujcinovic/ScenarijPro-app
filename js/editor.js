document.addEventListener("DOMContentLoaded", function () {
  const div = document.getElementById("divEditor");
  const poruke = document.getElementById("poruke");

  function ispisiPoruku(msg) {
    if (poruke) {
      poruke.textContent =
        typeof msg === "string" ? msg : JSON.stringify(msg, null, 2);
    } else {
      console.log(msg);
    }
  }

  function formatResult(label, value) {
    if (value === undefined) return `${label}: (nema rezultata)`;
    if (value === null) return `${label}: null`;
    if (typeof value === "string") return `${label}: ${value}`;
    if (typeof value === "number") return `${label}: ${value}`;
    if (typeof value === "boolean") return `${label}: ${value ? "DA" : "NE"}`;
    return { [label]: value };
  }

  if (!div) {
    console.error("Nije pronađen divEditor");
    return;
  }

  let editor;
  try {
    editor = EditorTeksta(div);
  } catch (e) {
    ispisiPoruku(e.message);
    return;
  }

  let btnBrojRijeci = document.getElementById("btnBrojRijeci");
  if (btnBrojRijeci) {
    btnBrojRijeci.addEventListener("click", function () {
      let rez = editor.dajBrojRijeci();

      if (rez && typeof rez === "object" && "ukupno" in rez) {
        ispisiPoruku(
          `Ukupno riječi: ${rez.ukupno}, boldiranih: ${rez.boldiranih}, italic: ${rez.italic}`
        );
      } else {
        ispisiPoruku(formatResult("Broj riječi", rez));
      }
    });
  }

  let btnUloge = document.getElementById("btnUloge");
  if (btnUloge) {
    btnUloge.addEventListener("click", function () {
      let uloge = editor.dajUloge();
      ispisiPoruku(formatResult("Uloge", uloge));
    });
  }

  let btnPogresne = document.getElementById("btnPogresneUloge");
  if (btnPogresne) {
    btnPogresne.addEventListener("click", function () {
      let sumnjive = editor.pogresnaUloga();

      if (Array.isArray(sumnjive)) {
        if (sumnjive.length === 0) {
          ispisiPoruku("Nema potencijalno pogrešno napisanih uloga.");
        } else {
          ispisiPoruku("Potencijalno pogrešne uloge:\n- " + sumnjive.join("\n- "));
        }
      } else {
        ispisiPoruku(formatResult("Pogrešne uloge", sumnjive));
      }
    });
  }

  let btnBrojLinija = document.getElementById("btnBrojLinija");
  let inputUlogaLinije = document.getElementById("inputUlogaLinije");
  if (btnBrojLinija && inputUlogaLinije) {
    btnBrojLinija.addEventListener("click", function () {
      let uloga = (inputUlogaLinije.value || "").trim();
      if (!uloga) {
        ispisiPoruku('Unesi ulogu za broj linija (npr. ALICE).');
        return;
      }

      let br = editor.brojLinijaTeksta(uloga);
      ispisiPoruku(`Broj linija teksta za ulogu "${uloga}": ${br}`);
    });
  }

  let btnScenarijUloge = document.getElementById("btnScenarijUloge");
  let inputUlogaScenarij = document.getElementById("inputUlogaScenarij");
  if (btnScenarijUloge && inputUlogaScenarij) {
    btnScenarijUloge.addEventListener("click", function () {
      let uloga = (inputUlogaScenarij.value || "").trim();
      if (!uloga) {
        ispisiPoruku('Unesi ulogu za scenarij (npr. ALICE).');
        return;
      }

      let rez = editor.scenarijUloge(uloga);
      ispisiPoruku(formatResult(`Scenarij uloge (${uloga})`, rez));
    });
  }

  let btnGrupe = document.getElementById("btnGrupeUloga");
  if (btnGrupe) {
    btnGrupe.addEventListener("click", function () {
      let rez = editor.grupisiUloge();
      ispisiPoruku(formatResult("Grupe uloga", rez));
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
