# CrossMigrate for Power Platform ToolBox

Visual ETL pipeline tool for migrating data into Microsoft Dataverse, packaged as a [Power Platform ToolBox](https://github.com/PowerPlatformToolBox/sample-tools) tool.

## Architecture

This repo shares UI components with [CrossMigrate](https://github.com/mileslabrador/CrossMigrate) (standalone version) via git subtree. The key difference: instead of a Node.js server handling auth and Dataverse calls, this version uses PPTB's built-in `window.dataverseAPI` and `window.toolboxAPI`.

### Adapter Layer

`src/lib/api.ts` provides the same function signatures as the standalone version's `client/src/lib/api.js`, but routes calls through PPTB's APIs:

| Standalone (server) | PPTB (client-side) |
|---|---|
| Express + MSAL auth | `window.dataverseAPI` (auth handled by host) |
| `/api/entities` | Dataverse Web API via `dataverseAPI.fetch()` |
| `/api/upload-csv` | Client-side PapaParse |
| `/api/upload-xlsx` | Client-side SheetJS |
| `/api/import-dataverse` | `dataverseAPI.fetch()` POST per row |

## Syncing Shared Code

Pull shared UI components from CrossMigrate:

```bash
git subtree pull --prefix=src/shared git@github.com:mileslabrador/CrossMigrate.git main --squash
```

## Build

```bash
npm install
npm run build    # produces dist/ with IIFE bundle
```

The build output is a single IIFE-bundled JS file + CSS, compatible with PPTB's iframe loading mechanism.

## License

GPL-3.0 — see [LICENSE](LICENSE).
