document.addEventListener("DOMContentLoaded", function () {
  const btnNewScenario = document.getElementById("btnNewScenario");
  const createBtn = document.querySelector(".create-button");

  if (typeof PoziviAjaxFetch === "undefined") {
    console.error("PoziviAjaxFetch nije učitan");
    return;
  }

  function askUserId() {
    const last = localStorage.getItem("userId") || "1";
    const input = prompt("Unesi userId (integer):", last);
    if (input === null) return null; 

    const userId = Number(String(input).trim());
    if (!Number.isInteger(userId) || userId < 1) {
      alert("userId mora biti pozitivan cijeli broj (npr. 1, 2, 3).");
      return null;
    }

    localStorage.setItem("userId", String(userId));
    return userId;
  }

  function askTitle() {
    const t = prompt("Unesi naziv scenarija:", "Neimenovani scenarij");
    if (t === null) return null; 
    return String(t);
  }

  function createScenarioFlow() {
    const userId = askUserId();
    if (userId === null) return;

    const title = askTitle();
    if (title === null) return;

    PoziviAjaxFetch.postScenario(title, (status, data) => {
      if (status !== 200) {
        alert("Greška pri kreiranju scenarija: " + (data?.message || "Nepoznata greška"));
        return;
      }

      const scenarioId = data.id;
      window.location.href = `/html/writing.html?scenarioId=${scenarioId}&userId=${userId}`;
    });
  }

  if (btnNewScenario) btnNewScenario.addEventListener("click", createScenarioFlow);
  if (createBtn) createBtn.addEventListener("click", createScenarioFlow);
});
