import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";

const API_ROOT = "https://api.dexscreener.com/tokens/v1/solana";
const NETWORK = "Solana";
const CHAIN_ID = 1399811149;
const BATCH_SIZE = 30;
const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(scriptDirectory, "..");
const catalogPath = resolve(projectRoot, "data/assets.js");
const outputPath = resolve(projectRoot, "data/liquidity.js");

async function loadCatalog() {
  const source = await readFile(catalogPath, "utf8");
  const context = { window: {} };
  vm.runInNewContext(source, context);
  const assets = context.window.XSTOCKS_DATA?.assets;
  if (!Array.isArray(assets) || !assets.length) throw new Error("No xStocks catalog found; refresh data/assets.js first");
  return assets;
}

async function fetchJson(url, attempts = 3) {
  let lastError;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      const response = await fetch(url, { headers: { Accept: "application/json" } });
      if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
      const data = await response.json();
      if (!Array.isArray(data)) throw new Error("Unexpected response body");
      return data;
    } catch (error) {
      lastError = error;
      if (attempt < attempts) await new Promise((resolveDelay) => setTimeout(resolveDelay, attempt * 1000));
    }
  }
  throw new Error(`Failed ${url}: ${lastError?.message}`);
}

function finiteNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

const catalog = await loadCatalog();
const tokens = catalog.flatMap((asset) => {
  const deployment = asset.deployments.find((candidate) => candidate.network === NETWORK);
  return deployment ? [{ symbol: asset.symbol, address: deployment.address }] : [];
});
const tokensByAddress = new Map(tokens.map((token) => [token.address, { ...token, pairs: new Map() }]));
if (tokensByAddress.size !== tokens.length) throw new Error("Duplicate Solana contract address in xStocks catalog");

for (let offset = 0; offset < tokens.length; offset += BATCH_SIZE) {
  const batch = tokens.slice(offset, offset + BATCH_SIZE);
  const addresses = batch.map((token) => encodeURIComponent(token.address)).join(",");
  const pairs = await fetchJson(`${API_ROOT}/${addresses}`);

  for (const pair of pairs) {
    if (pair.chainId !== "solana" || !pair.pairAddress) continue;
    for (const side of [pair.baseToken, pair.quoteToken]) {
      const token = tokensByAddress.get(side?.address);
      if (token) token.pairs.set(pair.pairAddress, pair);
    }
  }

  process.stdout.write(`DEX Screener: ${Math.min(offset + batch.length, tokens.length)}/${tokens.length} contracts\n`);
}

const records = [...tokensByAddress.values()].flatMap((token) => {
  const pairs = [...token.pairs.values()].filter((pair) => (finiteNumber(pair.liquidity?.usd) ?? 0) > 0);
  if (!pairs.length) return [];
  pairs.sort((a, b) => (finiteNumber(b.liquidity?.usd) ?? 0) - (finiteNumber(a.liquidity?.usd) ?? 0));
  const topPair = pairs[0];
  const liquidityUsd = pairs.reduce((sum, pair) => sum + (finiteNumber(pair.liquidity?.usd) ?? 0), 0);
  const volume24h = pairs.reduce((sum, pair) => sum + (finiteNumber(pair.volume?.h24) ?? 0), 0);

  return [{
    symbol: token.symbol,
    network: NETWORK,
    chainId: CHAIN_ID,
    address: token.address,
    liquidityUsd,
    pairCount: pairs.length,
    dexes: [...new Set(pairs.map((pair) => pair.dexId).filter(Boolean))].sort(),
    volume24h,
    priceUsd: finiteNumber(topPair.priceUsd),
    change24h: finiteNumber(topPair.priceChange?.h24),
    topPairUrl: topPair.url || null,
  }];
}).sort((a, b) => b.liquidityUsd - a.liquidityUsd || a.symbol.localeCompare(b.symbol));

records.forEach((record, index) => { record.rank = index + 1; });
const assets = Object.fromEntries(records.map((record) => [record.symbol, record]));
const dataset = {
  meta: {
    generatedAt: new Date().toISOString(),
    source: API_ROOT,
    provider: "DEX Screener",
    metric: "USD reserves summed across indexed Solana liquidity pools",
    aggregation: "Sum of unique indexed Solana pools per xStock contract",
    catalogAssets: catalog.length,
    queriedAssets: tokens.length,
    indexedAssets: records.length,
    totalPairs: records.reduce((sum, record) => sum + record.pairCount, 0),
  },
  assets,
};
const payload = `/* Generated from DEX Screener's public API. */\nwindow.LIQUIDITY_DATA=${JSON.stringify(dataset)};\n`;

await mkdir(dirname(outputPath), { recursive: true });
await writeFile(outputPath, payload, "utf8");

const eligible = records.filter((record) => record.liquidityUsd >= 100000).length;
process.stdout.write(`Wrote ${outputPath}: ${records.length} indexed assets, ${eligible} above $100k\n`);
