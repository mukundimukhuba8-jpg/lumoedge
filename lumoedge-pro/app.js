(() => {
  const powerBtn = document.getElementById("powerBtn");
  const powerLabel = document.getElementById("powerLabel");
  const statusState = document.getElementById("statusState");
  const statusBar = document.getElementById("statusBar");
  const quotesBtn = document.getElementById("quotesBtn");
  const removeBtn = document.getElementById("removeBtn");
  const quotesSheet = document.getElementById("quotesSheet");
  const quoteList = document.getElementById("quoteList");
  const toast = document.getElementById("toast");
  const drawer = document.getElementById("drawer");
  const menuBtn = document.getElementById("menuBtn");
  const drawerClose = document.getElementById("drawerClose");
  const drawerBackdrop = document.getElementById("drawerBackdrop");

  let running = true;
  let removed = false;
  let toastTimer = null;

  const pairs = [
    { pair: "EURUSD", price: 1.0842, chg: 0.12 },
    { pair: "GBPUSD", price: 1.2718, chg: -0.08 },
    { pair: "USDJPY", price: 149.62, chg: 0.21 },
    { pair: "XAUUSD", price: 2348.4, chg: 0.35 },
    { pair: "BTCUSD", price: 67540, chg: -1.12 },
    { pair: "NAS100", price: 19842, chg: 0.44 },
  ];

  function showToast(message) {
    toast.hidden = false;
    toast.textContent = message;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => {
      toast.hidden = true;
    }, 1800);
  }

  function renderStatus() {
    if (removed) {
      statusState.textContent = "removed";
      statusState.className = "status-state is-removed";
      powerLabel.textContent = "start";
      powerBtn.classList.add("is-off");
      powerBtn.setAttribute("aria-pressed", "false");
      statusBar.style.opacity = "0.55";
      return;
    }

    statusBar.style.opacity = "1";
    if (running) {
      statusState.textContent = "running";
      statusState.className = "status-state";
      powerLabel.textContent = "stop";
      powerBtn.classList.remove("is-off");
      powerBtn.setAttribute("aria-pressed", "true");
    } else {
      statusState.textContent = "stopped";
      statusState.className = "status-state is-stopped";
      powerLabel.textContent = "start";
      powerBtn.classList.add("is-off");
      powerBtn.setAttribute("aria-pressed", "false");
    }
  }

  function togglePower() {
    if (removed) {
      removed = false;
      running = true;
      showToast("lumoedge pro restored");
      renderStatus();
      return;
    }
    running = !running;
    showToast(running ? "bot started" : "bot stopped");
    renderStatus();
  }

  function renderQuotes() {
    quoteList.innerHTML = pairs
      .map((q) => {
        const up = q.chg >= 0;
        const sign = up ? "+" : "";
        return `<li>
          <span class="quote-pair">${q.pair}</span>
          <span class="quote-price">${formatPrice(q.price)}</span>
          <span class="quote-chg ${up ? "up" : "down"}">${sign}${q.chg.toFixed(2)}%</span>
        </li>`;
      })
      .join("");
  }

  function formatPrice(n) {
    if (n >= 1000) return n.toLocaleString("en-US", { maximumFractionDigits: 1 });
    return n.toFixed(n < 10 ? 4 : 2);
  }

  function tickQuotes() {
    for (const q of pairs) {
      const delta = (Math.random() - 0.5) * (q.price * 0.0008);
      q.price = Math.max(0.0001, q.price + delta);
      q.chg = Math.max(-3, Math.min(3, q.chg + (Math.random() - 0.5) * 0.08));
    }
    if (!quotesSheet.hidden) renderQuotes();
  }

  function openQuotes() {
    renderQuotes();
    quotesSheet.hidden = false;
  }

  function closeQuotes() {
    quotesSheet.hidden = true;
  }

  function removeBot() {
    if (removed) {
      showToast("already removed");
      return;
    }
    const ok = window.confirm("Remove lumoedge pro from this terminal?");
    if (!ok) return;
    removed = true;
    running = false;
    renderStatus();
    showToast("bot removed");
  }

  function openDrawer() {
    drawer.hidden = false;
  }

  function closeDrawer() {
    drawer.hidden = true;
  }

  powerBtn.addEventListener("click", togglePower);
  quotesBtn.addEventListener("click", openQuotes);
  removeBtn.addEventListener("click", removeBot);
  menuBtn.addEventListener("click", openDrawer);
  drawerClose.addEventListener("click", closeDrawer);
  drawerBackdrop.addEventListener("click", closeDrawer);

  drawer.querySelectorAll("[data-nav]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const action = btn.getAttribute("data-nav");
      closeDrawer();
      if (action === "quotes") openQuotes();
      if (action === "power") togglePower();
      if (action === "remove") removeBot();
    });
  });

  quotesSheet.querySelectorAll("[data-close-sheet]").forEach((el) => {
    el.addEventListener("click", closeQuotes);
  });

  setInterval(tickQuotes, 1600);
  renderStatus();
})();
