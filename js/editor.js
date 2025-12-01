// editor.js

document.addEventListener("DOMContentLoaded", function () {
  let div = document.getElementById("divEditor");
  let poruke = document.getElementById("poruke");

  if (!div) {
    console.error("Nije pronađen divEditor");
    return;
  }

  let editor;
  try {
    editor = EditorTeksta(div);
  } catch (e) {
    console.error(e.message);
    if (poruke) poruke.textContent = e.message;
    return;
  }

  function ispisiPoruku(msg) {
    if (poruke) {
      poruke.textContent = typeof msg === "string" ? msg : JSON.stringify(msg, null, 2);
    } else {
      console.log(msg);
    }
  }

  // --- dugmad za brojanje riječi ---
  let btnBrojRijeci = document.getElementById("btnBrojRijeci");
  if (btnBrojRijeci) {
    btnBrojRijeci.addEventListener("click", function () {
      let rez = editor.dajBrojRijeci();
      ispisiPoruku(
        `Ukupno: ${rez.ukupno}, boldiranih: ${rez.boldiranih}, italic: ${rez.italic}`
      );
    });
  }

  // --- dugme za dajUloge ---
  let btnUloge = document.getElementById("btnUloge");
  if (btnUloge) {
    btnUloge.addEventListener("click", function () {
      let uloge = editor.dajUloge();
      ispisiPoruku(uloge);
    });
  }

  // --- dugme za pogresnaUloga ---
  let btnPogresne = document.getElementById("btnPogresneUloge");
  if (btnPogresne) {
    btnPogresne.addEventListener("click", function () {
      let sumnjive = editor.pogresnaUloga();
      ispisiPoruku(sumnjive);
    });
  }

  // --- brojLinijaTeksta(uloga) ---
  let btnBrojLinija = document.getElementById("btnBrojLinija");
  let inputUlogaLinije = document.getElementById("inputUlogaLinije");
  if (btnBrojLinija && inputUlogaLinije) {
    btnBrojLinija.addEventListener("click", function () {
      let uloga = inputUlogaLinije.value || "";
      let br = editor.brojLinijaTeksta(uloga);
      ispisiPoruku(`Uloga ${uloga} ima ukupno ${br} linija teksta.`);
    });
  }

  // --- scenarijUloge(uloga) ---
  let btnScenarijUloge = document.getElementById("btnScenarijUloge");
  let inputUlogaScenarij = document.getElementById("inputUlogaScenarij");
  if (btnScenarijUloge && inputUlogaScenarij) {
    btnScenarijUloge.addEventListener("click", function () {
      let uloga = inputUlogaScenarij.value || "";
      let rez = editor.scenarijUloge(uloga);
      ispisiPoruku(rez);
    });
  }

  // --- grupisiUloge() ---
  let btnGrupe = document.getElementById("btnGrupeUloga");
  if (btnGrupe) {
    btnGrupe.addEventListener("click", function () {
      let rez = editor.grupisiUloge();
      ispisiPoruku(rez);
    });
  }

  // --- formatirajTekst("bold" | "italic" | "underline") ---
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
