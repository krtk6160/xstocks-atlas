# xStocks Atlas

A dependency-free static directory for Solana xStocks with at least $100,000 of verified Matcha liquidity. It supports full-text search, exchange filters, Matcha liquidity ranking, contract inspection, official indicative quote snapshots, deep links, and an interactive TradingView chart for each underlying security.

## Live site

<https://krtk6160.github.io/xstocks-atlas/>

## Run locally

```bash
npm run dev
```

Open <http://127.0.0.1:4173>. The catalog itself is bundled into `data/assets.js`, so search and filtering also work when `index.html` is opened directly. Logos and TradingView charts require an internet connection.

Every push to `main` deploys the static browser assets through GitHub Actions. The maintenance scripts and local server are kept in the repository but excluded from the Pages artifact.

## Refresh the catalog

```bash
npm run refresh-data
npm run refresh-matcha
npm run check
```

The refresh script paginates through the official public xStocks v2 API and requests one indicative quote per asset. This currently stays just below the API's 1,000-request-per-minute limit. Use `npm run refresh-data:catalog-only` when only contracts and metadata are needed.

`refresh-matcha` snapshots Matcha's stock discovery feed through a temporary headless Firefox session. Matcha protects the same-origin endpoint with a browser checkpoint, so a normal server-side fetch is rejected. Firefox must be installed; no API key or npm dependency is required.

## Data notes

- Catalog, chain deployments, contract addresses, and indicative prices come from `https://api.xstocks.fi/api/v2/public/assets`.
- Matcha-indexed liquidity is estimated USD liquidity available within 2.5% of spot, as defined in Matcha's discovery UI and powered by Codex. The default cross-network value is the deepest supported chain, not a sum across chains.
- The visible catalog requires at least $100,000 on Solana. Assets below the floor, assets not indexed by Matcha, and non-Solana deployments remain in the source snapshots but are excluded from the UI.
- The public API exposes a latest indicative quote, but no historical price series.
- The interactive graph therefore shows the underlying listed security through TradingView. The UI labels that distinction explicitly because an xStock can trade away from the underlying price outside primary-market hours.
- The site is independent and is not affiliated with Backed, xStocks, or TradingView.
