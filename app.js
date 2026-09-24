(() => {
  "use strict";

  const dataset = window.XSTOCKS_DATA;
  const liquidityDataset = window.LIQUIDITY_DATA || { meta: {}, assets: {} };
  if (!dataset?.assets?.length) {
    document.querySelector("#result-summary").textContent = "Asset data could not be loaded.";
    return;
  }

  const PAGE_SIZE = 48;
  const MIN_LIQUIDITY_USD = 100000;
  const ACTIVE_NETWORK = "Solana";
  const API_ROOT = "https://api.xstocks.fi/api/v2/public/assets";
  const NETWORK_COLORS = {
    Solana: "#9c6cff",
    Ethereum: "#88a7ff",
    Arbitrum: "#28a0f0",
    Optimism: "#ff4f55",
    Mantle: "#efefef",
    Ink: "#ff8ec7",
    Ton: "#38a8ea",
    BinanceSmartChain: "#f3ba2f",
    XLayer: "#c6ff36",
    HyperEVM: "#50e3c2",
    Tron: "#ff4040",
  };
  const NETWORK_LABELS = {
    BinanceSmartChain: "BNB Chain",
    HyperEVM: "HyperEVM",
    XLayer: "X Layer",
    Ton: "TON",
  };
  const EXCHANGE_PREFIXES = {
    XNAS: "NASDAQ",
    XNYS: "NYSE",
    ARCX: "AMEX",
    BATS: "AMEX",
    XASE: "AMEX",
    XLON: "LSE",
    XHKG: "HKEX",
    XMAD: "BME",
    XETR: "XETR",
  };

  const state = {
    query: "",
    exchange: "all",
    sort: "liquidity-desc",
    visible: PAGE_SIZE,
    selected: null,
  };

  const els = {
    snapshotLabel: document.querySelector("#snapshot-label"),
    assetCount: document.querySelector("#asset-count"),
    networkCount: document.querySelector("#network-count"),
    deploymentCount: document.querySelector("#deployment-count"),
    search: document.querySelector("#asset-search"),
    exchangeFilter: document.querySelector("#exchange-filter"),
    sortOrder: document.querySelector("#sort-order"),
    reset: document.querySelector("#reset-filters"),
    resultSummary: document.querySelector("#result-summary"),
    grid: document.querySelector("#asset-grid"),
    empty: document.querySelector("#empty-state"),
    emptyReset: document.querySelector("#empty-reset"),
    loadMoreWrap: document.querySelector("#load-more-wrap"),
    loadMore: document.querySelector("#load-more"),
    loadMoreCount: document.querySelector("#load-more-count"),
    dialog: document.querySelector("#asset-dialog"),
    dialogClose: document.querySelector("#dialog-close"),
    dialogLogo: document.querySelector("#dialog-logo"),
    dialogLogoFallback: document.querySelector("#dialog-logo-fallback"),
    dialogExchange: document.querySelector("#dialog-exchange"),
    dialogTitle: document.querySelector("#dialog-title"),
    dialogName: document.querySelector("#dialog-name"),
    dialogPrice: document.querySelector("#dialog-price"),
    chartContainer: document.querySelector("#chart-container"),
    chartNote: document.querySelector("#chart-note"),
    assetRecord: document.querySelector("#asset-record"),
    deploymentList: document.querySelector("#deployment-list"),
    dialogNetworkCount: document.querySelector("#dialog-network-count"),
    apiRecordLink: document.querySelector("#api-record-link"),
    copyAssetLink: document.querySelector("#copy-asset-link"),
    toast: document.querySelector("#toast"),
    liquidityCoverage: document.querySelector("#liquidity-coverage"),
    liquiditySnapshot: document.querySelector("#liquidity-snapshot"),
    themeToggle: document.querySelector("#theme-toggle"),
    themeIcon: document.querySelector("#theme-icon"),
    themeLabel: document.querySelector("#theme-label"),
    themeColor: document.querySelector('meta[name="theme-color"]'),
  };

  const assets = dataset.assets
    .filter((asset) => {
      const liquidity = liquidityDataset.assets?.[asset.symbol];
      return liquidity?.network === ACTIVE_NETWORK && liquidity.liquidityUsd >= MIN_LIQUIDITY_USD;
    })
    .map((asset) => ({
    ...asset,
    liquidity: liquidityDataset.assets?.[asset.symbol] || null,
    deployments: asset.deployments.filter((deployment) => deployment.network === ACTIVE_NETWORK),
    searchText: normalize([
      asset.symbol,
      asset.name,
      asset.underlyingSymbol,
      asset.isin,
      asset.underlyingIsin,
      asset.country,
      asset.exchange?.mic,
      asset.exchange?.abbreviation,
      asset.exchange?.name,
      liquidityDataset.assets?.[asset.symbol] ? "dex screener pool liquidity" : "",
      ...(liquidityDataset.assets?.[asset.symbol]?.dexes || []),
      ...asset.deployments.flatMap((deployment) => [deployment.network, deployment.address, deployment.wrapperAddress]),
    ].filter(Boolean).join(" ")),
    }));
  const assetsBySymbol = new Map(assets.map((asset) => [asset.symbol.toLowerCase(), asset]));

  function normalize(value) {
    return String(value).toLowerCase().normalize("NFKD").replace(/[\u0300-\u036f]/g, "");
  }

  function escapeHtml(value) {
    return String(value ?? "").replace(/[&<>'"]/g, (char) => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      "'": "&#39;",
      '"': "&quot;",
    })[char]);
  }

  function networkLabel(network) {
    return NETWORK_LABELS[network] || network;
  }

  function networkColor(network) {
    return NETWORK_COLORS[network] || "#a2a596";
  }

  function cleanName(name) {
    return name.replace(/\s+xStock$/i, "");
  }

  function formatNumber(value) {
    return new Intl.NumberFormat("en-US").format(value);
  }

  function formatTimestamp(value) {
    return new Intl.DateTimeFormat("en-GB", {
      day: "2-digit",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
      timeZone: "UTC",
    }).format(new Date(value)).toUpperCase() + " UTC";
  }

  function formatPrice(asset) {
    if (!Number.isFinite(asset.price)) return "UNAVAILABLE";
    const currency = asset.currency || "USD";
    try {
      return new Intl.NumberFormat("en-US", {
        style: "currency",
        currency,
        minimumFractionDigits: asset.price < 10 ? 2 : 2,
        maximumFractionDigits: asset.price < 1 ? 4 : 2,
      }).format(asset.price);
    } catch {
      return `${asset.price.toLocaleString("en-US")} ${currency}`;
    }
  }

  function formatUsdCompact(value) {
    if (!Number.isFinite(value)) return "NOT INDEXED";
    if (value === 0) return "$0";
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
      notation: value >= 1000 ? "compact" : "standard",
      minimumFractionDigits: value < 1000 ? 0 : 1,
      maximumFractionDigits: value < 1000 ? 0 : 2,
    }).format(value);
  }

  function liquidityPoint(asset) {
    return asset.liquidity?.network === ACTIVE_NETWORK ? asset.liquidity : null;
  }

  function currentTheme() {
    return document.documentElement.dataset.theme === "dark" ? "dark" : "light";
  }

  function updateThemeControl() {
    const dark = currentTheme() === "dark";
    els.themeToggle.setAttribute("aria-pressed", String(dark));
    els.themeToggle.setAttribute("aria-label", `Switch to ${dark ? "light" : "dark"} mode`);
    els.themeIcon.textContent = dark ? "☀" : "☾";
    els.themeLabel.textContent = dark ? "Light" : "Dark";
    els.themeColor.content = dark ? "#182134" : "#f5f1e8";
  }

  function setTheme(theme) {
    document.documentElement.dataset.theme = theme;
    try { localStorage.setItem("xstocks-theme", theme); } catch {}
    updateThemeControl();
    if (state.selected && els.dialog.open) renderChart(state.selected);
  }

  function initializeStats() {
    els.snapshotLabel.textContent = `SNAPSHOT ${formatTimestamp(dataset.meta.generatedAt)}`;
    els.assetCount.textContent = formatNumber(assets.length);
    els.networkCount.textContent = "1";
    els.deploymentCount.textContent = formatNumber(assets.reduce((total, asset) => total + asset.deployments.length, 0));
    els.liquidityCoverage.textContent = formatNumber(assets.length);
    els.liquiditySnapshot.textContent = liquidityDataset.meta.generatedAt
      ? `SNAPSHOT ${formatTimestamp(liquidityDataset.meta.generatedAt)}`
      : "NO SNAPSHOT";
  }

  function initializeFilters() {
    const exchanges = [...new Map(assets
      .filter((asset) => asset.exchange)
      .map((asset) => [asset.exchange.mic, asset.exchange]))
      .values()]
      .sort((a, b) => a.abbreviation.localeCompare(b.abbreviation));

    exchanges.forEach((exchange) => {
      const option = document.createElement("option");
      option.value = exchange.mic;
      option.textContent = `${exchange.abbreviation} · ${exchange.name}`;
      els.exchangeFilter.append(option);
    });
  }

  function filteredAssets() {
    const terms = normalize(state.query).trim().split(/\s+/).filter(Boolean);
    const result = assets.filter((asset) => {
      const matchesQuery = terms.every((term) => asset.searchText.includes(term));
      const matchesExchange = state.exchange === "all" || asset.exchange?.mic === state.exchange;
      const point = liquidityPoint(asset);
      const meetsLiquidityFloor = Boolean(point) && point.liquidityUsd >= MIN_LIQUIDITY_USD;
      return matchesQuery && matchesExchange && meetsLiquidityFloor;
    });

    const liquidityValue = (asset) => liquidityPoint(asset)?.liquidityUsd;
    const compareLiquidity = (a, b, direction) => {
      const aValue = liquidityValue(a);
      const bValue = liquidityValue(b);
      if (!Number.isFinite(aValue)) return Number.isFinite(bValue) ? 1 : a.symbol.localeCompare(b.symbol);
      if (!Number.isFinite(bValue)) return -1;
      return direction * (aValue - bValue) || a.symbol.localeCompare(b.symbol);
    };
    const compare = {
      "liquidity-desc": (a, b) => compareLiquidity(a, b, -1),
      "liquidity-asc": (a, b) => compareLiquidity(a, b, 1),
      "symbol-asc": (a, b) => a.symbol.localeCompare(b.symbol),
      "symbol-desc": (a, b) => b.symbol.localeCompare(a.symbol),
      "name-asc": (a, b) => cleanName(a.name).localeCompare(cleanName(b.name)),
      "networks-desc": (a, b) => b.deployments.length - a.deployments.length || a.symbol.localeCompare(b.symbol),
    }[state.sort];

    return result.sort(compare);
  }

  function render() {
    const filtered = filteredAssets();
    const shown = filtered.slice(0, state.visible);
    const totalLabel = filtered.length === 1 ? "asset" : "assets";
    const qualifiers = [];
    qualifiers.push(ACTIVE_NETWORK);
    if (state.exchange !== "all") qualifiers.push(state.exchange);
    qualifiers.push("$100k+ indexed pool liquidity");
    if (state.query.trim()) qualifiers.push(`“${state.query.trim()}”`);

    els.resultSummary.innerHTML = `<strong>${formatNumber(filtered.length)}</strong> ${totalLabel}${qualifiers.length ? ` / ${escapeHtml(qualifiers.join(" / "))}` : " / complete catalog"}`;
    els.grid.innerHTML = shown.map(assetCard).join("");
    els.grid.setAttribute("aria-busy", "false");
    els.empty.hidden = filtered.length !== 0;
    els.loadMoreWrap.hidden = shown.length >= filtered.length || filtered.length === 0;
    els.loadMoreCount.textContent = els.loadMoreWrap.hidden ? "" : `${formatNumber(filtered.length - shown.length)} remaining`;
  }

  function assetCard(asset) {
    const visibleNetworks = asset.deployments.slice(0, 7);
    const remaining = asset.deployments.length - visibleNetworks.length;
    const exchange = asset.exchange?.abbreviation || "UNLISTED";
    const price = Number.isFinite(asset.price) ? formatPrice(asset) : `${asset.currency || "USD"} quote`;
    const poolData = liquidityPoint(asset);
    const liquidity = poolData ? formatUsdCompact(poolData.liquidityUsd) : "NOT INDEXED";
    const liquidityContext = poolData
      ? `${networkLabel(poolData.network)} · ${poolData.pairCount} ${poolData.pairCount === 1 ? "pool" : "pools"}`
      : "DEX Screener";

    return `
      <button class="asset-card" type="button" data-symbol="${escapeHtml(asset.symbol)}" aria-label="Open ${escapeHtml(asset.name)} details and chart">
        <div class="card-top">
          <span class="card-logo">
            <img src="${escapeHtml(asset.logo)}" alt="" loading="lazy" onerror="this.remove()" />
            ${escapeHtml(asset.symbol.slice(0, 2).toUpperCase())}
          </span>
          <span class="card-exchange">${escapeHtml(exchange)}</span>
        </div>
        <h3 class="card-symbol">${escapeHtml(asset.symbol)}${asset.halted ? '<span class="halted-badge">HALTED</span>' : ""}</h3>
        <p class="card-name">${escapeHtml(cleanName(asset.name))}</p>
        <div class="card-market">
          <div>
            <span>Backed indicative</span>
            <strong>${escapeHtml(price)}</strong>
          </div>
          <div class="card-liquidity">
            <span>Pool liquidity</span>
            <strong>${escapeHtml(liquidity)}</strong>
            <small>${escapeHtml(liquidityContext)}</small>
          </div>
        </div>
        <div class="card-networks" aria-label="${asset.deployments.length} network deployments">
          ${visibleNetworks.map((deployment) => `<i class="network-dot" style="--network-color:${networkColor(deployment.network)}" title="${escapeHtml(networkLabel(deployment.network))}"></i>`).join("")}
          ${remaining > 0 ? `<span class="network-overflow">+${remaining}</span>` : ""}
        </div>
        <span class="card-action">CHART + DETAILS →</span>
      </button>`;
  }

  function resetFilters({ focus = false } = {}) {
    state.query = "";
    state.exchange = "all";
    state.sort = "liquidity-desc";
    state.visible = PAGE_SIZE;
    els.search.value = "";
    els.exchangeFilter.value = "all";
    els.sortOrder.value = "liquidity-desc";
    render();
    if (focus) els.search.focus();
  }

  function chartTicker(asset) {
    const mic = asset.exchange?.mic;
    let ticker = asset.symbol.replace(/x$/, "");
    if (mic === "XLON") ticker = ticker.replace(/\.GB$/i, "");
    if (mic === "XHKG") ticker = ticker.padStart(4, "0");
    const prefix = EXCHANGE_PREFIXES[mic];
    return prefix ? `${prefix}:${ticker}` : asset.underlyingSymbol || ticker;
  }

  function openAsset(asset, { updateUrl = true } = {}) {
    state.selected = asset;
    const exchangeText = asset.exchange
      ? `${asset.exchange.abbreviation} / ${asset.exchange.mic} / ${asset.country}`
      : `${asset.country} / EXCHANGE NOT REPORTED`;

    els.dialogExchange.textContent = exchangeText;
    els.dialogTitle.textContent = asset.symbol;
    els.dialogName.textContent = cleanName(asset.name);
    els.dialogLogo.src = asset.logo;
    els.dialogLogo.alt = `${cleanName(asset.name)} logo`;
    els.dialogLogo.style.display = "block";
    els.dialogLogoFallback.textContent = asset.symbol.slice(0, 2).toUpperCase();
    els.dialogLogoFallback.style.display = "none";
    els.dialogLogo.onerror = () => {
      els.dialogLogo.style.display = "none";
      els.dialogLogoFallback.style.display = "block";
    };
    els.dialogPrice.textContent = formatPrice(asset);
    els.apiRecordLink.href = `${API_ROOT}/${encodeURIComponent(asset.symbol)}`;
    els.dialogNetworkCount.textContent = asset.deployments.length;
    els.chartNote.textContent = `${chartTicker(asset)} · TradingView chart for the underlying listed security. The xStock token can trade at a premium or discount, especially outside primary-market hours.`;

    const selectedLiquidity = liquidityPoint(asset);
    els.assetRecord.innerHTML = recordRows([
      ["Pool liquidity", selectedLiquidity ? `${formatUsdCompact(selectedLiquidity.liquidityUsd)} on ${networkLabel(selectedLiquidity.network)}` : "Not indexed"],
      ["Indexed pools", selectedLiquidity ? String(selectedLiquidity.pairCount) : "—"],
      ["DEXes", selectedLiquidity?.dexes?.length ? selectedLiquidity.dexes.join(", ") : "—"],
      ["DEX volume 24h", selectedLiquidity ? formatUsdCompact(selectedLiquidity.volume24h) : "—"],
      ["Underlying", asset.underlyingSymbol || "—"],
      ["Exchange", asset.exchange ? `${asset.exchange.name} (${asset.exchange.mic})` : "Not reported"],
      ["Currency", asset.currency || "—"],
      ["Listing country", asset.country || "—"],
      ["xStock ISIN", asset.isin || "—"],
      ["Underlying ISIN", asset.underlyingIsin || "—"],
      ["Trading mode", asset.tradingMode || "Not reported"],
      ["Status", asset.halted ? "Trading halted" : "Active"],
    ]);
    els.deploymentList.innerHTML = asset.deployments.map(deploymentMarkup).join("");

    if (!els.dialog.open) els.dialog.showModal();
    document.body.classList.add("dialog-open");
    renderChart(asset);

    if (updateUrl) {
      const url = new URL(window.location.href);
      url.searchParams.set("asset", asset.symbol);
      history.replaceState({ asset: asset.symbol }, "", url);
    }
  }

  function recordRows(rows) {
    return rows.map(([term, value]) => `<div><dt>${escapeHtml(term)}</dt><dd>${escapeHtml(value)}</dd></div>`).join("");
  }

  function deploymentMarkup(deployment, index) {
    return `
      <details class="deployment" style="--network-color:${networkColor(deployment.network)}" ${index === 0 ? "open" : ""}>
        <summary>
          ${escapeHtml(networkLabel(deployment.network))}
          ${deployment.atomic ? '<span class="atomic-badge">ATOMIC SWAPS</span>' : ""}
        </summary>
        ${contractRow("Contract", deployment.address)}
        ${deployment.wrapperAddress ? contractRow("Wrapper", deployment.wrapperAddress) : ""}
      </details>`;
  }

  function contractRow(label, value) {
    return `<div class="contract-row"><span>${escapeHtml(label)}</span><code title="${escapeHtml(value)}">${escapeHtml(value)}</code><button class="copy-button" type="button" data-copy="${escapeHtml(value)}">COPY</button></div>`;
  }

  function renderChart(asset) {
    els.chartContainer.innerHTML = '<div class="chart-loading"><span></span>Loading market chart…</div>';
    const container = document.createElement("div");
    container.className = "tradingview-widget-container";
    const widget = document.createElement("div");
    widget.className = "tradingview-widget-container__widget";
    container.append(widget);

    const script = document.createElement("script");
    script.type = "text/javascript";
    script.src = "https://s3.tradingview.com/external-embedding/embed-widget-advanced-chart.js";
    script.async = true;
    script.textContent = JSON.stringify({
      autosize: true,
      symbol: chartTicker(asset),
      interval: "D",
      timezone: asset.exchange?.timezone || "Etc/UTC",
      theme: currentTheme(),
      style: "1",
      locale: "en",
      backgroundColor: currentTheme() === "dark" ? "#212d43" : "#fffdf8",
      gridColor: currentTheme() === "dark" ? "rgba(255,255,255,0.08)" : "rgba(27,37,64,0.08)",
      allow_symbol_change: true,
      calendar: false,
      hide_side_toolbar: false,
      support_host: "https://www.tradingview.com",
    });
    container.append(script);
    els.chartContainer.replaceChildren(container);
  }

  function closeDialog({ updateUrl = true } = {}) {
    if (els.dialog.open) els.dialog.close();
    document.body.classList.remove("dialog-open");
    state.selected = null;
    if (updateUrl) {
      const url = new URL(window.location.href);
      url.searchParams.delete("asset");
      history.replaceState({}, "", url);
    }
  }

  let toastTimer;
  function showToast(message) {
    els.toast.textContent = message;
    els.toast.classList.add("show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => els.toast.classList.remove("show"), 1800);
  }

  async function copyText(value, successMessage) {
    try {
      await navigator.clipboard.writeText(value);
      showToast(successMessage);
    } catch {
      const input = document.createElement("textarea");
      input.value = value;
      input.style.position = "fixed";
      input.style.opacity = "0";
      document.body.append(input);
      input.select();
      document.execCommand("copy");
      input.remove();
      showToast(successMessage);
    }
  }

  function bindEvents() {
    els.search.addEventListener("input", () => {
      state.query = els.search.value;
      state.visible = PAGE_SIZE;
      render();
    });

    els.exchangeFilter.addEventListener("change", () => {
      state.exchange = els.exchangeFilter.value;
      state.visible = PAGE_SIZE;
      render();
    });

    els.sortOrder.addEventListener("change", () => {
      state.sort = els.sortOrder.value;
      render();
    });

    els.reset.addEventListener("click", () => resetFilters());
    els.emptyReset.addEventListener("click", () => resetFilters({ focus: true }));
    els.loadMore.addEventListener("click", () => {
      state.visible += PAGE_SIZE;
      render();
    });

    els.grid.addEventListener("click", (event) => {
      const card = event.target.closest("[data-symbol]");
      if (!card) return;
      const asset = assetsBySymbol.get(card.dataset.symbol.toLowerCase());
      if (asset) openAsset(asset);
    });

    els.dialogClose.addEventListener("click", () => closeDialog());
    els.dialog.addEventListener("cancel", (event) => {
      event.preventDefault();
      closeDialog();
    });
    els.dialog.addEventListener("click", (event) => {
      if (event.target === els.dialog) closeDialog();
    });
    els.deploymentList.addEventListener("click", (event) => {
      const button = event.target.closest("[data-copy]");
      if (button) copyText(button.dataset.copy, "Contract copied");
    });
    els.copyAssetLink.addEventListener("click", () => copyText(window.location.href, "Asset link copied"));
    els.themeToggle.addEventListener("click", () => {
      setTheme(currentTheme() === "dark" ? "light" : "dark");
    });

    document.addEventListener("keydown", (event) => {
      const tag = document.activeElement?.tagName;
      const isTyping = tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT";
      if ((event.key === "/" && !isTyping) || ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k")) {
        event.preventDefault();
        els.search.focus();
        els.search.select();
      }
    });

    window.addEventListener("popstate", () => {
      const symbol = new URL(window.location.href).searchParams.get("asset");
      if (!symbol) return closeDialog({ updateUrl: false });
      const asset = assetsBySymbol.get(symbol.toLowerCase());
      if (asset) openAsset(asset, { updateUrl: false });
    });
  }

  function openDeepLink() {
    const symbol = new URL(window.location.href).searchParams.get("asset");
    const asset = symbol ? assetsBySymbol.get(symbol.toLowerCase()) : null;
    if (asset) openAsset(asset, { updateUrl: false });
  }

  updateThemeControl();
  initializeStats();
  initializeFilters();
  bindEvents();
  render();
  openDeepLink();
})();
