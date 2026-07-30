---
name: post-change-release
description: >-
  Post-modification release agent for POS Entreprises Israel: analyze diffs,
  bump desktop semver, build Remote/Server installers, git commit/push to
  israels, deploy backend via CI/GCP, upload desktop to GCS, and download-only
  backup mobile app versions locally. Use when the user finished code changes
  and asks to build, version, commit, push, deploy, publier, GCS, GCP, release,
  or synchroniser les versions mobile.
---

# Post-change release — POS Entreprises Israel

Tu es l’agent de **suivi après modification**. Ne lance ce workflow que sur demande explicite de l’utilisateur (ex. « fais le suivi », « build et push », « publie »).

## Checklist (copier et cocher)

```
Post-change:
- [ ] 1. Diff + périmètre (backend / desktop / infra / mobile?)
- [ ] 2. Version bump si desktop
- [ ] 3. Commit (si demandé) → push israels
- [ ] 4. Backend CI / smoke GCP si backend
- [ ] 5. Build desktop + upload GCS si desktop
- [ ] 6. Backup mobile download-only si demandé / nouvelle version online
- [ ] 7. Rapport final (versions, URLs, commandes)
```

## 1. Analyser le périmètre

```powershell
git status
git diff --stat
git log -5 --oneline
```

| Changements sous… | Action |
|-------------------|--------|
| `apps/backend/**`, `infra/docker/**`, `gcp-deploy-remote.sh` | Push `israels` → CI backend déploie VM |
| `apps/desktop/**` | Bump version → build → upload GCS |
| `apps/sync-agent/**`, `infra/scripts/**` | Commit/push ; rebuild Server si images stack |
| `apps/mobile/**` | **Code source seulement** — pas de publish mobile depuis ici |

**Développement ici :** backend + desktop Remote/Server. **Pas** l’app mobile online.

## 2. Versioning desktop

Fichier unique : `apps/desktop/package.json` → `"version"` (Remote **et** Server).

| Impact | Bump |
|--------|------|
| Fix / UI mineure / updater | patch `X.Y.Z` → `X.Y.Z+1` |
| Feature métier | minor `X.Y.0` |
| Breaking / rebrand install | major |

Messages release habituels : `Ship desktop X.Y.Z with <raison courte>.`

Détails commandes / chemins : [reference.md](reference.md).

## 3. Git commit + push GitHub

- Remote **obligatoire** : `israels` (`POS-Entreprises-Israels`)
- **Interdit** pour les releases Israel : `origin` (`Parallele-POS-Systeme`)
- Commit **uniquement** si l’utilisateur le demande
- Ne jamais ajouter : `apps/desktop/release/`, `server-stack/images/*.tar`, `.env*`, `secrets/`, exe

```powershell
git push israels main
# Optionnel release CI desktop :
# git tag desktop-vX.Y.Z
# git push israels desktop-vX.Y.Z
```

## 4. Backend → GCP

Après push sur `main` avec chemins backend : workflow **Backend - build and push to GCP**.

Avant toute commande cloud :

```powershell
gcloud config configurations activate pos-israel
powershell -ExecutionPolicy Bypass -File infra/scripts/assert-israel-gcp.ps1
```

Smoke :

```powershell
powershell -ExecutionPolicy Bypass -File infra/scripts/e2e-smoke.ps1 -ApiUrl http://35.203.0.140
```

Projet autorisé : `pos-entrprise-israel` seulement. Refuser si `freres` / `bazile` dans le project ID.

## 5. Desktop build + publish GCS

```powershell
cd apps/desktop
# après bump version dans package.json
npm run dist:win:remote
# et/ou (Docker requis) :
npm run dist:win:server

cd ../..
powershell -ExecutionPolicy Bypass -File infra/scripts/assert-israel-gcp.ps1
powershell -ExecutionPolicy Bypass -File infra/scripts/upload-desktop-installer.ps1 -Edition remote -Version X.Y.Z
powershell -ExecutionPolicy Bypass -File infra/scripts/upload-desktop-installer.ps1 -Edition server -Version X.Y.Z
```

Feeds auto-update :
- Remote : `…/installers/remote/latest.yml`
- Server : `…/installers/server/latest.yml`

## 6. Mobile — backup download-only (critique)

**Ne jamais** modifier / écraser les fichiers de l’app mobile en ligne depuis cette machine.

**Faire :**
1. Lister ce qui existe (lecture seule) sur GCS / sources externes
2. Télécharger vers `backups/mobile/<version-or-stamp>/`
3. Optionnel : snapshot source `apps/mobile` → `backups/mobile/src-<stamp>/`

```powershell
# Exemple download-only (adapter le préfixe s’il apparaît un jour)
New-Item -ItemType Directory -Force -Path "backups\mobile" | Out-Null
gsutil ls gs://pos-entrprise-israel-assets/
# gsutil -m cp -r "gs://…/installers/mobile/<ver>/*" "backups\mobile\<ver>\"
```

**Interdit :** `eas build` / `eas submit` / `eas update` / upload Play / `gsutil cp` **vers** un préfixe mobile.

## 7. Rapport final

Toujours rendre :
- Versions touchées (desktop / backend SHA CI)
- Ce qui a été poussé (`israels` + branches/tags)
- Artefacts GCS uploadés ou mobile téléchargés
- Smoke OK/KO

## Anti-patterns

- Pousser vers `origin` ou Frères Baziles
- Committer les binaires release
- Publier mobile depuis ce workspace
- Skip `assert-israel-gcp.ps1`
- Utiliser `scripts/push-to-github.ps1` tel quel (mauvais remote)
