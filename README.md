# xStocks Atlas

A dependency-free static directory for Solana xStocks with at least $100,000 in DEX Screener-indexed pool liquidity. It supports full-text search, exchange filters, liquidity ranking, contract inspection, official indicative quote snapshots, deep links, and an interactive TradingView chart for each underlying security.

## Live site

<https://krtk6160.github.io/xstocks-atlas/>

## Run locally

```bash
npm run dev
```

Open <http://127.0.0.1:4173>. The catalog itself is bundled into `data/assets.js`, so search and filtering also work when `index.html` is opened directly. Logos and TradingView charts require an internet connection.

Every push to `main` deploys the static browser assets through GitHub Actions. A scheduled run refreshes DEX Screener liquidity, the xStocks catalog, and visible indicative quotes every hour before deploying. The live site therefore stays current without adding automated commits to the repository. GitHub may delay scheduled runs during periods of high Actions load.

The maintenance scripts and local server are kept in the repository but excluded from the Pages artifact.

## Refresh the catalog

```bash
npm run refresh-data:catalog-only
npm run refresh-liquidity
npm run refresh-data:visible
npm run check
```

The catalog refresh paginates through the official public xStocks v2 API. The liquidity refresh batches all Solana contract addresses through DEX Screener's public token endpoint. The final refresh requests indicative quotes only for assets that pass the $100,000 liquidity floor.

No API key or npm dependency is required.

## Data notes

- Catalog, chain deployments, contract addresses, and indicative prices come from `https://api.xstocks.fi/api/v2/public/assets`.
- Liquidity is the sum of USD reserves across unique Solana pools returned by DEX Screener for each xStock contract. It does not include RFQ, intent, order-book, or off-chain liquidity.
- The visible catalog requires at least $100,000 of indexed Solana pool liquidity. Assets below the floor, unindexed assets, and non-Solana deployments are excluded from the UI.
- The public API exposes a latest indicative quote, but no historical price series.
- The interactive graph therefore shows the underlying listed security through TradingView. The UI labels that distinction explicitly because an xStock can trade away from the underlying price outside primary-market hours.
- The site is independent and is not affiliated with Backed, xStocks, or TradingView.
