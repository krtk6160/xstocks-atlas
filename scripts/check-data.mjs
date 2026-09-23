import { readFile } from "node:fs/promises";
import vm from "node:vm";

const source = await readFile(new URL("../data/assets.js", import.meta.url), "utf8");
const liquiditySource = await readFile(new URL("../data/liquidity.js", import.meta.url), "utf8");
const context = { window: {} };
vm.runInNewContext(source, context);
vm.runInNewContext(liquiditySource, context);
const data = context.window.XSTOCKS_DATA;
const liquidity = context.window.LIQUIDITY_DATA;

if (!data?.assets?.length) throw new Error("No assets in generated data");
if (data.meta.totalAssets !== data.assets.length) throw new Error("Asset count mismatch");

const symbols = new Set();
const networks = new Set();
let deployments = 0;

for (const asset of data.assets) {
  if (!asset.symbol || !asset.name || !asset.logo) throw new Error(`Incomplete asset: ${JSON.stringify(asset)}`);
  if (symbols.has(asset.symbol)) throw new Error(`Duplicate symbol: ${asset.symbol}`);
  symbols.add(asset.symbol);
  if (!asset.deployments.length) throw new Error(`No deployment for ${asset.symbol}`);
  for (const deployment of asset.deployments) {
    if (!deployment.network || !deployment.address) throw new Error(`Incomplete deployment for ${asset.symbol}`);
    networks.add(deployment.network);
    deployments += 1;
  }
}

if (networks.size !== data.meta.networks.length) throw new Error("Network count mismatch");
if (deployments !== data.meta.totalDeployments) throw new Error("Deployment count mismatch");

const liquidityAssets = Object.values(liquidity?.assets || {});
if (liquidityAssets.length !== liquidity.meta.indexedAssets) throw new Error("DEX Screener asset count mismatch");
for (const [index, asset] of liquidityAssets.sort((a, b) => a.rank - b.rank).entries()) {
  if (!symbols.has(asset.symbol)) throw new Error(`Liquidity symbol missing from xStocks catalog: ${asset.symbol}`);
  if (asset.rank !== index + 1) throw new Error(`Invalid liquidity rank for ${asset.symbol}`);
  if (asset.network !== "Solana") throw new Error(`Unexpected liquidity network for ${asset.symbol}`);
  if (!Number.isFinite(asset.liquidityUsd) || asset.liquidityUsd <= 0) throw new Error(`Invalid liquidity for ${asset.symbol}`);
  if (!Number.isInteger(asset.pairCount) || asset.pairCount < 1) throw new Error(`No indexed pool for ${asset.symbol}`);
  const catalogAsset = data.assets.find((candidate) => candidate.symbol === asset.symbol);
  const deployment = catalogAsset.deployments.find((candidate) => candidate.network === "Solana");
  if (deployment?.address !== asset.address) throw new Error(`Solana address mismatch for ${asset.symbol}`);
}

const eligibleAssets = liquidityAssets.filter((asset) => asset.liquidityUsd >= 100000);
if (!eligibleAssets.length) throw new Error("No assets meet the $100k pool-liquidity floor");

process.stdout.write(`OK: ${symbols.size} unique assets, ${networks.size} networks, ${deployments} deployments, ${liquidityAssets.length} DEX Screener records, ${eligibleAssets.length} above $100k\n`);
