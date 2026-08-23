# Agents — POS Entreprises Israel

## Isolation (critique)

Ce projet est un **fork opérationnel** pour **Entreprises Israel**.  
Frères Baziles doit continuer à tourner **sans aucune intervention** depuis ce dépôt.

- GCP autorisé : **`pos-entrprise-israel`** uniquement
- Compte SDK : config **`pos-israel`** (`israelnesly0@gmail.com`)
- **Ne jamais** cibler `pos-freres-basiles`, ses buckets, VMs, Artifact Registry, secrets GitHub, ou clés PEM

Voir aussi : `.cursor/rules/tenant-isolation-israel.mdc`  
Garde runtime : `infra/scripts/assert-israel-gcp.ps1`

## Fuseau horaire (critique)

Toute date métier / affichage / borne de journée = **`America/Port-au-Prince`** uniquement.  
Ne pas utiliser le fuseau OS de la machine ni UTC pour l’UI ou les filtres « jour / mois ».

Voir `apps/backend/src/common/time/timezone.ts` et `apps/desktop/src/renderer/utils/datetime.ts`.

## Agent rattrapage mobile ← desktop

Plan point-par-point pour aligner `apps/mobile` sur le desktop :

- Skill : `.cursor/skills/mobile-parity-desktop/SKILL.md`
- Checklist : `.cursor/skills/mobile-parity-desktop/checklist.md`
- Status : `.cursor/skills/mobile-parity-desktop/scripts/status.sh`

## Agent post-modification (release)

Après des changements terminés, l’agent de suivi gère versioning, build, commit/push, GCP et backups.

- Règle : `.cursor/rules/post-change-release-agent.mdc`
- Skill : `.cursor/skills/post-change-release/SKILL.md`
- GitHub ops : remote **`israels`** (`POS-Entreprises-Israels`) — pas `origin`
- Sur cette machine : **backend + desktop Remote/Server** ; mobile = **backup download-only**, jamais publier/écraser l’app mobile online

## Mises à jour APK Android (in-app)

Téléchargement + install **dans l’app** (pas un lien navigateur). Skill :
`.cursor/skills/android-in-app-apk-update/SKILL.md`
