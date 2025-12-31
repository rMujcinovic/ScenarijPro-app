// IIFE modul: callback(status, data)

const PoziviAjaxFetch = (function () {
  const BASE = ""; 

  async function request(method, url, body) {
    try {
      const res = await fetch(BASE + url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: body !== undefined ? JSON.stringify(body) : undefined
      });

      let data = null;
      try {
        data = await res.json();
      } catch {
        data = { message: "Neispravan JSON odgovor sa servera." };
      }

      return { status: res.status, data };
    } catch (err) {
      return { status: 0, data: { message: err?.message || "Network error" } };
    }
  }

  function cbWrap(promise, callback) {
    promise.then(({ status, data }) => callback(status, data));
  }

  return {
    postScenario: function (title, callback) {
      cbWrap(request("POST", "/api/scenarios", { title }), callback);
    },

    lockLine: function (scenarioId, lineId, userId, callback) {
      cbWrap(request("POST", `/api/scenarios/${scenarioId}/lines/${lineId}/lock`, { userId }), callback);
    },

    updateLine: function (scenarioId, lineId, userId, newText, callback) {
      cbWrap(request("PUT", `/api/scenarios/${scenarioId}/lines/${lineId}`, { userId, newText }), callback);
    },

    lockCharacter: function (scenarioId, characterName, userId, callback) {
      cbWrap(
        request("POST", `/api/scenarios/${scenarioId}/characters/lock`, { userId, characterName }),
        callback
      );
    },

    updateCharacter: function (scenarioId, userId, oldName, newName, callback) {
      cbWrap(
        request("POST", `/api/scenarios/${scenarioId}/characters/update`, { userId, oldName, newName }),
        callback
      );
    },

    getDeltas: function (scenarioId, since, callback) {
      cbWrap(request("GET", `/api/scenarios/${scenarioId}/deltas?since=${since}`), callback);
    },

    getScenario: function (scenarioId, callback) {
      cbWrap(request("GET", `/api/scenarios/${scenarioId}`), callback);
    }
  };
})();
