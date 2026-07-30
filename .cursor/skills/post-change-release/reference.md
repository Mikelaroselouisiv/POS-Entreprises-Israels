# Référence release — commandes et chemins

## Remotes Git

| Nom | URL | Usage |
|-----|-----|--------|
| `israels` | `https://github.com/Mikelaroselouisiv/POS-Entreprises-Israels.git` | **Ops Israel** — push ici |
| `origin` | `https://github.com/Mikelaroselouisiv/Parallele-POS-Systeme.git` | Legacy — ne pas utiliser pour release |

Branche courante typique : `main` → `israels/main`.

## Versions actuelles (à re-lire dans les fichiers)

| App | Fichier | Notes |
|-----|---------|--------|
| Desktop Remote + Server | `apps/desktop/package.json` | Semver partagé |
| Backend | `apps/backend/package.json` | Image Docker taguée SHA + `latest` |
| Mobile | `apps/mobile/package.json` + `app.json` | Source only ici |
| Sync-agent | `apps/sync-agent/package.json` | Inclus dans stack Server |

## Artefacts desktop locaux

| Chemin | Contenu |
|--------|---------|
| `apps/desktop/release/` | exe, blockmap, `latest.yml` (gitignored) |
| `apps/desktop/electron-builder.remote.json` | Flavor Remote |
| `apps/desktop/electron-builder.server.json` | Flavor Server |
| `apps/desktop/scripts/prepare-server-stack.ps1` | Images Docker dans l’installeur Server |

Noms attendus :
- `POS-Entreprise-Israel-Remote-X.Y.Z.exe`
- `POS-Entreprise-Israel-Server-X.Y.Z.exe`

## GCS Israel

Bucket : `gs://pos-entrprise-israel-assets`

| Préfixe | Rôle |
|---------|------|
| `installers/remote/` | Auto-update postes Remote |
| `installers/server/` | Installateurs machine mère |
| `sync-assets/` | Assets sync |

URLs publiques update feed (`apps/desktop/src/main/update-feed.cjs`) :
- `https://storage.googleapis.com/pos-entrprise-israel-assets/installers/remote`
- `https://storage.googleapis.com/pos-entrprise-israel-assets/installers/server`

## GCP compute / API

| Ressource | Valeur |
|-----------|--------|
| Project | `pos-entrprise-israel` |
| Config gcloud | `pos-israel` |
| Région / zone | `northamerica-northeast1` / `northamerica-northeast1-a` |
| Artifact Registry | `pos-backend` |
| Image | `northamerica-northeast1-docker.pkg.dev/pos-entrprise-israel/pos-backend/backend` |
| VM | `pos-api` → `35.203.0.140` |

## CI GitHub (repo Israels)

| Workflow | Déclencheur |
|----------|-------------|
| `.github/workflows/backend-gcp.yml` | push `main` sur chemins backend/docker/deploy |
| `.github/workflows/desktop-release-gcp.yml` | tag `desktop-v*` ou `workflow_dispatch` |

## Scripts utiles

```powershell
infra/scripts/assert-israel-gcp.ps1
infra/scripts/upload-desktop-installer.ps1 -Edition remote|server [-Version X.Y.Z]
infra/scripts/e2e-smoke.ps1 -ApiUrl http://35.203.0.140
infra/scripts/gcp-provision-sync.ps1
infra/scripts/gcp-deploy-remote.sh   # côté VM / CI
```

## Backup mobile local

Dossier convention : `backups/mobile/` (ne pas committer les binaires).

```powershell
$stamp = Get-Date -Format "yyyyMMdd-HHmm"
Copy-Item -Recurse "apps\mobile" "backups\mobile\src-$stamp"
# Puis downloads GCS/EAS en lecture seule dans backups\mobile\<version>\
```

## Docs

- `docs/DEPLOYMENT.md` — flux IT magasin / Remote / Server
- `docs/GCP_ISRAEL.md` — ressources cloud
- `AGENTS.md` — isolation + timezone
- `.cursor/rules/tenant-isolation-israel.mdc` — garde Frères
