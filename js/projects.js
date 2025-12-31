document.addEventListener("DOMContentLoaded", function () {
  if (typeof PoziviAjaxFetch === "undefined") {
    console.warn("PoziviAjaxFetch nije učitan.");
    return;
  }

  const btnNew = document.getElementById("btnNewScenario");
  if (!btnNew) return;

  btnNew.addEventListener("click", function () {
    const userIdStr = prompt("Unesi userId (integer):", localStorage.getItem("userId") || "1");
    if (!userIdStr) return;

    const userId = parseInt(userIdStr, 10);
    if (!Number.isFinite(userId)) return;

    localStorage.setItem("userId", String(userId));

    const title = prompt("Naslov scenarija:", "Neimenovani scenarij") ?? "";

    PoziviAjaxFetch.postScenario(title, (status, data) => {
      if (status !== 200) {
        alert(data?.message || "Greška pri kreiranju scenarija.");
        return;
      }
      localStorage.setItem("scenarioId", String(data.id));
      window.location.href = `writing.html?scenarioId=${data.id}&userId=${userId}`;
    });
  });
});
