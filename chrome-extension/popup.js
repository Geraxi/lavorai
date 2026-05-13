/* LavorAI Interview Copilot — popup controller. */

const codeInput = document.getElementById("code");
const btnStart = document.getElementById("btn-start");
const btnStop = document.getElementById("btn-stop");
const statusDot = document.getElementById("status-dot");
const statusText = document.getElementById("status-text");

// Load persisted code
chrome.storage.local.get(["pairingCode", "capturing"], (data) => {
  if (data.pairingCode) codeInput.value = data.pairingCode;
  updateUI(!!data.capturing);
});

codeInput.addEventListener("input", () => {
  chrome.storage.local.set({ pairingCode: codeInput.value.trim().toUpperCase() });
});

btnStart.addEventListener("click", async () => {
  const code = codeInput.value.trim().toUpperCase();
  if (code.length < 6) {
    setStatus("error", "Pairing code mancante o troppo corto");
    return;
  }
  setStatus("loading", "Avvio cattura...");
  chrome.runtime.sendMessage({ type: "START_CAPTURE", pairingCode: code }, (resp) => {
    if (chrome.runtime.lastError) {
      setStatus("error", chrome.runtime.lastError.message);
      return;
    }
    if (resp?.ok) {
      chrome.storage.local.set({ capturing: true });
      updateUI(true);
      setStatus("live", "In ascolto — la trascrizione fluisce su LavorAI");
    } else {
      setStatus("error", resp?.error ?? "Impossibile avviare la cattura");
    }
  });
});

btnStop.addEventListener("click", () => {
  chrome.runtime.sendMessage({ type: "STOP_CAPTURE" }, () => {
    chrome.storage.local.set({ capturing: false });
    updateUI(false);
    setStatus("idle", "Cattura fermata");
  });
});

function updateUI(capturing) {
  btnStart.style.display = capturing ? "none" : "";
  btnStop.style.display = capturing ? "" : "none";
}

function setStatus(state, text) {
  statusDot.className = "dot";
  if (state === "live") statusDot.classList.add("live");
  if (state === "error") statusDot.classList.add("error");
  statusText.textContent = text;
}
