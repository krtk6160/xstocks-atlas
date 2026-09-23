import { readFile } from "node:fs/promises";
import vm from "node:vm";

const source = await readFile(new URL("../data/assets.js", import.meta.url), "utf8");
const matchaSource = await readFile(new URL("../data/matcha-liquidity.js", import.meta.url), "utf8");
const context = { window: {} };
vm.runInNewContext(source, context);
vm.runInNewContext(matchaSource, context);
const data = context.window.XSTOCKS_DATA;
const matcha = context.window.MATCHA_LIQUIDITY;

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

const matchaAssets = Object.values(matcha?.assets || {});
if (matchaAssets.length !== matcha.meta.totalAssets) throw new Error("Matcha asset count mismatch");
for (const [index, asset] of matchaAssets.sort((a, b) => a.rank - b.rank).entries()) {
  if (!symbols.has(asset.symbol)) throw new Error(`Matcha symbol missing from xStocks catalog: ${asset.symbol}`);
  if (asset.rank !== index + 1) throw new Error(`Invalid Matcha rank for ${asset.symbol}`);
  if (!Number.isFinite(asset.liquidityUsd) || asset.liquidityUsd < 0) throw new Error(`Invalid Matcha liquidity for ${asset.symbol}`);
  if (!asset.chains.length) throw new Error(`No Matcha chain data for ${asset.symbol}`);
}

const eligibleAssets = matchaAssets.filter((asset) => asset.liquidityUsd >= 100000);
if (!eligibleAssets.length) throw new Error("No Matcha assets meet the $100k liquidity floor");

process.stdout.write(`OK: ${symbols.size} unique assets, ${networks.size} networks, ${deployments} deployments, ${matchaAssets.length} Matcha records, ${eligibleAssets.length} above $100k\n`);
