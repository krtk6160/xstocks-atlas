import { spawn } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const MATCHA_URL = "https://matcha.xyz/";
const MATCHA_NETWORK_IDS = [1, 8453, 4663, 5042, 56, 1399811149, 137, 999, 143, 42161, 57073, 10, 2741, 9745, 43114, 59144, 5000, 534352, 130];
const CHAIN_NAMES = {
  1: "Ethereum",
  10: "Optimism",
  56: "BinanceSmartChain",
  999: "HyperEVM",
  5000: "Mantle",
  42161: "Arbitrum",
  57073: "Ink",
  1399811149: "Solana",
};
const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const outputPath = resolve(scriptDirectory, "../data/matcha-liquidity.js");
const port = Number(process.env.MATCHA_FIREFOX_PORT || 9231);

const delay = (milliseconds) => new Promise((resolveDelay) => setTimeout(resolveDelay, milliseconds));

function decodeRemoteValue(remote) {
  if (!remote) return undefined;
  if (remote.type === "object") return Object.fromEntries(remote.value.map(([key, value]) => [key, decodeRemoteValue(value)]));
  if (remote.type === "array") return remote.value.map(decodeRemoteValue);
  if (remote.type === "null") return null;
  return remote.value;
}

class BidiClient {
  constructor(webSocket) {
    this.webSocket = webSocket;
    this.nextId = 0;
    this.pending = new Map();
    webSocket.addEventListener("message", (event) => {
      const message = JSON.parse(event.data);
      if (!message.id) return;
      const request = this.pending.get(message.id);
      if (!request) return;
      this.pending.delete(message.id);
      if (message.type === "error") request.reject(new Error(`${message.error}: ${message.message}`));
      else request.resolve(message.result);
    });
  }

  command(method, params = {}) {
    return new Promise((resolveCommand, rejectCommand) => {
      const id = ++this.nextId;
      this.pending.set(id, { resolve: resolveCommand, reject: rejectCommand });
      this.webSocket.send(JSON.stringify({ id, method, params }));
    });
  }
}

async function connectBidi(attempts = 80) {
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      const webSocket = new WebSocket(`ws://127.0.0.1:${port}/session`);
      await new Promise((resolveConnection, rejectConnection) => {
        webSocket.addEventListener("open", resolveConnection, { once: true });
        webSocket.addEventListener("error", rejectConnection, { once: true });
      });
      return new BidiClient(webSocket);
    } catch {
      await delay(250);
    }
  }
  throw new Error("Firefox WebDriver BiDi did not become ready");
}

async function fetchMatchaPage(client, context, page) {
  const query = new URLSearchParams({
    sortBy: "liquidity",
    sortDirection: "desc",
    timeframe: "24",
    page: String(page),
    preset: "stocks",
    pageDiscovery: "false",
    networks: MATCHA_NETWORK_IDS.join(","),
  });
  const path = `/api/discovery/tokens?${query}`;
  const response = await client.command("script.callFunction", {
    target: { context },
    functionDeclaration: "async (path) => { const response = await fetch(path); return { status: response.status, text: await response.text() }; }",
    arguments: [{ type: "string", value: path }],
    awaitPromise: true,
    resultOwnership: "none",
  });
  const result = decodeRemoteValue(response.result);
  if (result.status !== 200) throw new Error(`Matcha discovery request returned HTTP ${result.status}`);
  const body = JSON.parse(result.text);
  if (body.type !== "success" || !Array.isArray(body.data)) throw new Error("Unexpected Matcha discovery response");
  return body;
}

function numberOrNull(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function compactAsset(group) {
  const chains = group.tokens
    .map((entry) => ({
      network: CHAIN_NAMES[entry.token.chainId] || `Chain ${entry.token.chainId}`,
      chainId: entry.token.chainId,
      address: entry.token.address,
      liquidityUsd: numberOrNull(entry.liquidity) ?? 0,
      score: numberOrNull(entry.liquidityScore) ?? 0,
      volume24h: numberOrNull(entry.volByTime) ?? 0,
      holders: numberOrNull(entry.numHolders) ?? 0,
    }))
    .sort((a, b) => b.liquidityUsd - a.liquidityUsd || a.network.localeCompare(b.network));
  const deepest = chains[0];
  return {
    symbol: group.symbol,
    liquidityUsd: deepest?.liquidityUsd ?? 0,
    score: numberOrNull(group.maxLiquidityScore) ?? deepest?.score ?? 0,
    network: deepest?.network || "Unknown",
    chainId: deepest?.chainId || null,
    priceUsd: numberOrNull(group.price),
    volume24h: numberOrNull(group.volume) ?? deepest?.volume24h ?? 0,
    change24h: numberOrNull(group.change24h),
    marketCapUsd: numberOrNull(group.marketCap),
    chains,
  };
}

async function main() {
  const firefox = spawn("firefox", ["--headless", "--remote-debugging-port", String(port), MATCHA_URL], {
    stdio: ["ignore", "ignore", "pipe"],
  });
  let stderr = "";
  firefox.stderr.on("data", (chunk) => { stderr = `${stderr}${chunk}`.slice(-4000); });
  let client;

  try {
    client = await connectBidi();
    await client.command("session.new", { capabilities: { alwaysMatch: {} } });
    const tree = await client.command("browsingContext.getTree", {});
    const context = tree.contexts.find((entry) => entry.url.startsWith(MATCHA_URL))?.context || tree.contexts[0]?.context;
    if (!context) throw new Error("Could not find the Matcha browser context");

    await delay(2500);
    const groups = [];
    let page = 1;
    let totalCount = Infinity;
    while (groups.length < totalCount && page <= 20) {
      const response = await fetchMatchaPage(client, context, page);
      totalCount = response.totalCount;
      groups.push(...response.data);
      process.stdout.write(`Matcha page ${page}: ${response.data.length} assets (${groups.length}/${totalCount})\n`);
      page += 1;
    }

    const compact = groups.map(compactAsset).sort((a, b) => b.liquidityUsd - a.liquidityUsd || a.symbol.localeCompare(b.symbol));
    const assets = Object.fromEntries(compact.map((asset, index) => [asset.symbol, { ...asset, rank: index + 1 }]));
    const dataset = {
      meta: {
        generatedAt: new Date().toISOString(),
        source: "https://matcha.xyz/api/discovery/tokens",
        provider: "Matcha / Codex",
        metric: "Estimated USD liquidity available within 2.5% of spot price",
        aggregation: "Deepest Matcha-supported chain per asset",
        totalAssets: compact.length,
      },
      assets,
    };
    const payload = `/* Generated from Matcha's public discovery feed. */\nwindow.MATCHA_LIQUIDITY=${JSON.stringify(dataset)};\n`;
    await mkdir(dirname(outputPath), { recursive: true });
    await writeFile(outputPath, payload, "utf8");
    process.stdout.write(`Wrote ${outputPath}: ${compact.length} Matcha-indexed xStocks\n`);
  } catch (error) {
    if (stderr) process.stderr.write(stderr);
    throw error;
  } finally {
    try { await client?.command("session.end", {}); } catch {}
    firefox.kill("SIGTERM");
  }
}

await main();
