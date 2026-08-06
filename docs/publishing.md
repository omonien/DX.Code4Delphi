# Publishing — Visual Studio Marketplace

Status as of **2026-08-07**. Do **not** store PAT secrets in this repository.

## Marketplace (live)

| | |
|---|---|
| **Item ID** | `DeveloperExperts.code4delphi` |
| **Publisher ID** | `DeveloperExperts` (display: Developer Experts) |
| **Publisher account** | Olaf Monien (`olaf@developer-experts.net`) |
| **Public URL** | https://marketplace.visualstudio.com/items?itemName=DeveloperExperts.code4delphi |
| **Manage UI** | https://marketplace.visualstudio.com/manage/publishers/DeveloperExperts |
| **First published** | 2026-08-06 (manual VSIX upload of 1.3.3) |
| **Status** | Public, validated |
| **GitHub repo** | https://github.com/omonien/DX.Code4Delphi (renamed from `DX.Code4DelphiX`; old URL redirects) |

## Personal Access Token (CLI / `vsce`)

| | |
|---|---|
| **Purpose** | `vsce login` / `vsce publish` for publisher `DeveloperExperts` |
| **Scope** | Marketplace → **Manage** |
| **Verification** | Succeeded (`vsce` accepted the token for `DeveloperExperts`) |
| **Expires** | **2026-11-05** |

**Before 2026-11-05:** create a new PAT (same scope), run `npx @vscode/vsce login DeveloperExperts`, paste the new token.  
Never commit the token; never put it in issue/PR text or this file.

> Note: Azure DevOps **global** PATs are retired **2026-12-01**. Prefer renewing with the then-recommended Entra-based / org-scoped flow from the [publishing docs](https://code.visualstudio.com/api/working-with-extensions/publishing-extension).

## Local package / publish commands

```bash
npm test
npx @vscode/vsce package          # → code4delphi-<version>.vsix (gitignored)
npx @vscode/vsce login DeveloperExperts
npx @vscode/vsce publish         # uses stored login / --pat
```

Bump `version` in `package.json` and update `CHANGELOG.md` before each publish. Re-publishing an **existing** version is rejected by the marketplace.

## Manual upload (fallback)

Manage → Publisher **DeveloperExperts** → New extension / Update → upload the `.vsix`.  
Used successfully for the initial 1.3.3 release when PAT was not yet ready.
