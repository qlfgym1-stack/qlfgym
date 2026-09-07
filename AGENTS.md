## Goal
- Système de salaire coach (fixe + variable selon adhérents)
- Persistance sidebar localStorage
- Remise corporate au POS (paiement abonnement via carte entreprise)
- Assistant IA local `/ai-assistant` (prédictions + analyses heures/produits/actions P0-P2)

## Constraints & Preferences
- Ne pas modifier les fonctionnalités ni l'UI
- RLS basée sur les rôles (`admin` pour les mutations, `staff`/`coach` en lecture seule)
- Utiliser `service_role` pour les Edge Functions
- SHA-256 pour les codes de récupération
- Compatible Supabase Auth, RLS, React 18, TypeScript strict
- Vérifier avec `npx tsc --noEmit` et `npx vitest --run` après chaque correction
- **Après chaque correction : enregistrer automatiquement et TOUT LE TEMPS** — 1) en local, 2) commit + push GitHub, 3) appliquer le changement sur Supabase, 4) créer et pousser la migration Supabase correspondante (si le changement touche la base)
- **SOURCE DE DÉVELOPPEMENT UNIQUE : `C:\Users\wahra\Desktop\dinatek`** — tout développement/enregistrement se fait exclusivement sur `C:\` puis GitHub + Supabase. Ne JAMAIS utiliser `M:\Users\Click\Desktop\dinatek` comme source (disque `M:` corrompt les fichiers en temps réel — 8 fichiers remplis de NULs le 07/09 ; déjà corrigés par synchro C:→M: mais récidive possible). En cas de réparation de la copie M:, toujours recopier depuis `C:` (source de vérité).
- **NE JAMAIS déployer sur Vercel sans consulter l'utilisateur d'abord** — toujours demander confirmation avant `vercel --prod`

## Progress
### Done
- **noImplicitAny activé (C1)** — `tsconfig.json` `noImplicitAny: true`, 340 erreurs TS7006 corrigées sur 41 fichiers (typage des callbacks, `unknown` + casts JSONB, interfaces locales) ; `npx tsc --noEmit` ✅ zéro erreur
- **Page Analyses membres `/member-insights`** — hook `useMemberInsightsData` (5 queries Supabase parallèles + mock), 7 composants (KPI agrégés, activité, risque churn, matrice comportementale, fréquentation recharts, types abonnement, top membres LTV), route + sidebar, i18n FR/EN/AR, 4 fichiers de tests (29 tests) ; `notifPrefill` orphelin retiré des 3 i18n
- **Chat IA sur OpenRouter :free** — `supabase/functions/ai-chat` basculé de NVIDIA NIM vers OpenRouter (`https://openrouter.ai/api/v1/chat/completions`, clé `OPENROUTER_API_KEY`) : whitelist de modèles gratuits `:free` (prompt = 0, completion = 0) vérifiés (`openai/gpt-oss-20b:free` défaut et code, `nvidia/nemotron-3-nano-omni-30b-a3b-reasoning:free` analyse, `google/gemma-4-26b-a4b-it:free` multilingue, fallback auto si modèle indisponible) ; JWT + CORS conservés ; clé ajoutée au `.env` local (gitignored)
- **Robot IA flottant global (QLF premium, ÉTAPE 5)** — `src/components/layout/ai-robot.tsx` (`AiFloatingRobot` ~730 lignes, monté dans `AppLayout`, CSS `.qlf-*` index.css ~lignes 256+) : personnage SVG/CSS premium **taille fixe 1×** (plus aucun système de croissance) — gradients métal 6 stops, reflets, jointures, oreilles LED, bottes réacteurs, visière, sourcils + sourire lumineux, cœur QLF pulsant ; **yeux indépendants synchronisés** (`--eye-lx/--eye-ly` / `--eye-rx/--eye-ry`, convergence + micro-saccades + inertie, rAF) + clignement natif `.qlf-blink` ; **IDLE** respiration `.qlf-breathe` + tête `.qlf-head` + balancier bras `.qlf-arm-l/r` + ombre portée `--qlf-lift` ; **OBSERVE** visible (2,8 s, yeux qui balaient, hover non) → **TRAINING 1×** (trajets segmentés courts : smoothstep accélération/décélération 0.7–2.2 s, courbures `sin(π·p)·sway`, rotation vers cap via `--qlf-rot`, pauses 360–920 ms, restons dans les bornes) ; **propulsion feu premium** (glare/bleu/externe/coeur + 6 étincelles, intensité `--qlf-fire` ∝ dérivée smoothstep) ; **retour utilisateur** : TRAINING → STOP → REST → IDLE (sans bouteille) ; **clic robot = FENÊTRE IA FLOTTANTE** (plus de navigation `/ai-assistant`) : panel `RobotChatWindow` fixé près du robot (`qlf-panel`, 352×460, thema QLF dégradé bleu/indigo, boutons reset ✕, Esc ferme, animation `qlf-panel-in`), **réutilise le moteur existant** — `ChatSection` (prop `embedded`) + store partagé `useAiChat` (`src/stores/ai-chat.tsx`) + `useAssistantData(orgId, filters)` (chargées paresseusement à l'ouverture, loading dots), reste ouverte pendant la navigation (`AiChatProvider` au-dessus des routes) ; draggable souris/tactile + localStorage `qlf-robot-pos` + clavier Enter/Espace ; clé i18n `aiAssistant.chatReset`/`chatClose` (FR/EN/AR + CASE_PRESERVE) ; `.is-grow`/`--qlf-scale`/`--eye-x` supprimés — `npx tsc --noEmit` ✅ zéro erreur, `npx vitest --run` ✅ 181/181, `npx vite build` ✅ (126 precache)
- **Robot IA flottant global (QLF premium, ÉTAPE 6)** — `ai-robot.tsx` réécrit en **robot statique premium 2.5D** (~532 lignes, SVG `viewBox 0 0 116 156`) : **aucun déplacement/rotation/grandissement/entraînement** — aéronaute bleu nuit + bleu électrique (armure 6 stops `qlfArmor`/`qlfArmorDark`, chrome `qlfMetal`, reflets, jointures lumineuses cyan, aileron crête + antenne, pods latéraux, visière, sourcils/menton lueurs, logo QLF au cœur du torse avec halo, bottes à liseré) ; **micro-mouvements uniquement** : respiration très légère `.qlf-breathe` (scale 1.005), **yeux → souris** (`--eye-lx/ly`+`--eye-rx/ry`, convergence + inertie 0.14 + micro-saccades sin/cos, rAF) + **clignement occasionnel** `.qlf-blink` (3,2–7,2 s, 160 ms) ; **lueur statique sous les pieds** : halo `qlfFire` + 2 éventails `.qlf-fan` + 4 particules `.qlf-spark` (opacité seulement) ; **clic = fenêtre IA flottante** (réutilise `ChatSection` embedded + `useAiChat` + `useAssistantData`) ; drag/tactile + localStorage `qlf-robot-pos` + Entrée/Espace conservés ; classes obsolètes supprimées (`.is-idle/.is-observe/.is-training/.is-rest/.is-grow`, `--qlf-rot`, `--qlf-fire`, `.qlf-pupil-*`, `.qlf-fire-glare/blue/outer/core`, `.qlf-arm-l/r`) ; reduced-motion à jour — tsc ✅, vitest ✅ 181/181, build ✅ (126 precache)
- **Rôle super_admin fusionné dans admin** — migration 00059 : UPDATE données, contrainte CHECK sans 'super_admin', trigger `after_organization_insert` assigne 'admin', RPC seed → 'admin' ; types TS, auth store (`isSuperAdmin` retiré), sidebar (groupe superAdmin + pages super-admin/licenses supprimées), admin/users, coach-mode, checkin-dialog, Edge Functions, i18n → 'admin' ; `npx tsc --noEmit` ✅
- **Salaire coach (fixe + variable)** — `coach_default_salary` / `coach_default_rate_per_member` dans `organizations`, page coach-portal, salaire calculé selon adhérents
- **Sécurité CRITIQUE** — `renew_subscription` : retrait de `SECURITY DEFINER` → RLS appliqué au caller, plus de contournement possible
- **Sécurité CRITIQUE** — `user_roles` INSERT policy : restreinte à `role IN ('staff', 'coach')` ; trigger `after_organization_insert` auto-assigne `admin` ; client-side `user_roles.insert()` supprimé de `signUp`
- **Sécurité MEDIUM** — Recovery Edge Function : validation `!code` déplacée dans les blocs `verify`/`reset` ; `send_code` fonctionne désormais sans code
- **Sécurité MEDIUM** — POS stock decrement : nouveau RPC `decrement_product_stock` atomique (`WHERE stock >= p_qty`) ; migration `00008_atomic_stock_decrement.sql`
- **Hors-ligne** — Cache TanStack Query persistant : `PersistQueryClientProvider` + `createSyncStoragePersister` (localStorage, clé `FITMANAGER_QUERY_CACHE`, maxAge 24h)
- **Hors-ligne** — `networkMode: 'offlineFirst'` sur queries + mutations
- **Hors-ligne** — `staleTime: 120s`, `gcTime: 24h`, `retry: 1`
- **Hors-ligne** — Service Worker VitePWA : Workbox `NetworkFirst` pour `*.supabase.co/rest/v1/*`
- **Hors-ligne** — `src/hooks/useNetworkStatus.ts` : hook `isOnline` / `recovering`
- **Hors-ligne** — `src/components/ui/offline-banner.tsx` : bannière offline/online
- **Perf** — `useMemo` sur 3 contextes critiques : `auth.tsx`, `i18n/index.tsx`, `theme.tsx`
- **Perf** — Debug `console.log` supprimé de `navbar.tsx`
- **Perf** — `xlsx` et `jspdf` en `await import()` dans payments, members, attendance, equipment/report
- **Audit — Bug CRITIQUE** — Recovery EF `verify` ne retournait pas `userId` → fix : ajout de `userId` dans la réponse JSON
- **Audit — Bug CRITIQUE** — Lien "Forgot password?" sans route → retiré de sign-in.tsx
- **Audit — Bug MEDIUM** — Type `staff_shifts.day` incohérent avec colonne SQL `date` → renommé en `date` dans `supabase.ts` et `planning.tsx`
- **Audit — Bug MEDIUM** — Résidus debug navbar (`<span>{locale}</span>`, `console.log('[LangSwitch]')`) → nettoyés
- **Audit — Bug MEDIUM** — Avatar/User hardcodés dans navbar + sidebar → branchés sur `useAuth()`
- **Audit — Bug MEDIUM** — Badge notification en dur (`3`) → retiré
- **Audit — Bug MEDIUM** — Bouton logout sidebar sans onClick → lié à `signOut`
- **Audit — Bug MEDIUM** — Imports inutilisés (`Badge` dans navbar, `CardDescription` dans dashboard) → supprimés
- **Dashboard KPIs temps réel** — 7 requêtes Supabase remplaçant toutes les données mockées
- **Migration 00009** — `supabase/migrations/00009_subscription_payment_flow.sql` : ajout `pending_payment` à `member_subscriptions.status`, RPC `create_member_with_pending_subscription` (création atomique membre + abonnement en attente), RPC `finalize_subscription_payment` (activation atomique avec verrouillage, enregistrement paiement)
- **POS redirection workflow** — Dans `members.tsx` : sélecteur de type d'abonnement + date de début dans le formulaire d'ajout, appel au RPC `create_member_with_pending_subscription`, redirection vers `/pos` avec `location.state.pendingSubscription`
- **POS redirection workflow** — Dans `pos.tsx` : détection du `pendingSubscription` dans `location.state`, ajout automatique dans le panier comme article virtuel (avec badge "Subscription" et icône `CreditCard`), sélection automatique du membre, finalisation via `finalize_subscription_payment` RPC après le checkout normal
- **Page login finalisée** : layout 50/50, logos QLG_3D + LOGO QLForiginal, tout en français, fond photo avec overlay, pas de scroll vertical, description en blanc, logo gauche h-32 avec mt-16, "BIENVENUE SUR FITMANAGER PRO" sous le logo, grille features 3×2, footer "SIMPLE • RAPIDE • SÉCURISÉ"
- **Formulaire simplifié** : champs email + mot de passe seulement, lien "Obtenir mon code de récupération" avec dialog de génération, lien "Réinitialiser" pour mot de passe oublié
- **Migration 00011** : RPC `verify_recovery_code` — SHA-256, rate limiting 5/15min, comparaison en temps constant, logging dans `recovery_code_logs`
- **Edge Function** `sign-in-with-recovery/index.ts` : vérifie le code via RPC, génère un magic link token via `admin.generateLink`, retourne `{ token, newCode }`
- **Edge Function** `recovery/index.ts` : `send_code` modifié pour retourner le `newCode` en clair dans la réponse
- **Auth store** : `signIn` accepte désormais `recoveryCode?` optionnel — si fourni, appelle l'EF puis `verifyOtp`
- **Export All supprimé** de la page membres (`handleExportAll` + bouton retirés)
- **Téléphone formaté** : 3 nouvelles fonctions dans `src/lib/utils.ts` (`formatPhone`, `isValidDzPhone`, `displayPhone`) — appliquées dans 7 pages (members, staff, suppliers, gyms, corporate, pos) avec onBlur, display, import/export, mock data
- **Migration 00012** : `rfid_cards` recréée avec nouveau schéma (`rfid_uid` UNIQUE, status avec 7 états, `replaced_at`, `replaced_by`, `reason`, `notes`, `created_by`, `updated_at`), table `rfid_audit_log` créée, RLS policies, 6 RPCs (`assign_rfid_card`, `replace_rfid_card`, `deactivate_rfid_card`, `reactivate_rfid_card`, `check_rfid_available`, `get_member_rfid_history`), `rfid_check_in`/`rfid_check_out` recréés avec `rfid_uid`
- **Types TypeScript** : `RfidCard` mis à jour avec nouveau schéma, `RfidCardAudit` ajouté, `rfid_audit_log` dans Database
- **Composant RFID** : `src/pages/members/rfid-management.tsx` avec `RfidManagementDialog` (badge actuel avec status badge coloré, historique des badges, journal d'audit, boutons Remplacer/Désactiver/Réactiver, dialog de remplacement avec motif + vérification) et `RfidCreateSection` (section RFID dans formulaire création)
- **Intégration RFID dans members.tsx** : colonne RFID dans le tableau avec badge UID, bouton `Shield` dans les actions pour ouvrir `RfidManagementDialog`, `RfidCreateSection` dans le formulaire d'ajout, assignation RFID atomique (RPC `assign_rfid_card`) après création membre/subscription
- **`npx tsc --noEmit`** ✅ zéro erreur
- **`npx vitest --run`** ✅ 38/38 tests (20 tests phone, 4 recovery, 1 auth, 13 utils legacy)
- **`npx vite build`** ✅ succès
- **Migration 00044 - Dépenses** — table `expenses` (10 catégories), RLS (admin CRUD, staff read-only), indexes — appliquée Supabase
- **Page Dépenses `/expenses`** — CRUD, catégories, import/export Excel, filtres, résumé Total · nbr entrées, responsive
- **Migration 00045 - Lien Salaires→Dépenses** — trigger `sync_salary_payment_to_expense`, colonnes `reference_type`/`reference_id` sur `expenses`, backfill — appliquée Supabase
- **Migration 00046 - Rentabilité** — tables `investments` (9 catégories RLS) + `profitability_objectives` (monthly/yearly) — appliquée Supabase
- **Refactor Assistant Comptable** — Architecture 8 modules : hook `useAccountingData` + 6 composants (KPI, Revenus, Dépenses, Historique, Journaux, Alertes) + page principale
- **Agrégation multi-sources** — Revenus depuis `payments` (abonnements) + `pos_transactions` (ventes), dépenses depuis `expenses` (10 catégories)
- **6 journaux comptables** — Ventes, Dépenses, Encaissements, Grand Livre, Balance Générale, TVA (19% collectée/déductible)
- **Module Rentabilité & Profitabilité `/rentabilite`** — 13 agents parallèles, 10 composants :
  - `useProfitabilityData` hook : 11 requêtes Supabase + calculs ROI/marges/prévisions/insights
  - KpiCards (6 KPI), RevenueSection (CA par source), ProfitSection (brut/net/marges)
  - InvestmentSection (catégories + ROI), ProfitabilityBreakdown (7 onglets)
  - ForecastsSection (6 prévisions IA), ObjectivesSection (4 objectifs)
  - ChartsSection (6 graphiques recharts), AiInsights (8 règles d'analyse)
- **Fix TypeScript** — generics `useQuery<T>` retirés, casts `unknown` résolus — `npx tsc --noEmit` ✅ zéro erreur
- **Commit `231bc83`** + `3a93849` + `bd436bb` + `acb3818` poussés sur GitHub
- **Remise corporate au POS** — migration `00060_corporate_discount.sql` appliquée ✅ (seed 3 conventions QLF GYM : Sonatrach 15% active, Air Algérie 10% active, Algerian Telecom 20% inactive) ; `members.corporate_id` ; RPC `create_member_with_pending_subscription` → `p_corporate_id` ; corporate.tsx branché Supabase (CRUD complet) ; members.tsx Select « Carte entreprise » avec remise affichée ; pos.tsx : `corporateDiscount` (items `__subscription__`+`__renewal__` seulement, convention active + contrat en cours, retirable ✕/↺), `subscriptionPaid` transmis aux RPCs, ligne UI « Remise convention » ; i18n FR/AR/EN
- **Assistant IA `/ai-assistant`** — module complet : `src/pages/ai-assistant/` (page, `useAssistantData` 9 useQuery parallèles, 8 composants recharts), moteur pur `lib/` (`peakHours.ts`, `flagshipProducts.ts` excluant items virtuels, `subscriptionInsights.ts`, `forecast.ts` régression + saisonnalité + confiance 0-100, `recommendations.ts` P0/P1/P2, `insights.ts` clés i18n paramétrées) ; route `/ai-assistant` remplace le placeholder ; i18n FR/AR/EN ; 5 fichiers de tests vitest
- **Vérifs finales Assistant IA** — `npx tsc --noEmit` ✅ zéro erreur (corrections : `memberName` dans subscriptionInsights.test.ts, `forecastRevenue` → `next3Months: []` si < 2 mois, test peakHours en heure locale) ; `npx vitest --run` ✅ 67/67 ; `npx vite build` ✅ succès (chunk `ai-assistant-DvzNgSYf.js` 38 KB gzip 10.16)
- **Sécurité CRITIQUE RPC (migration 00061 + 00062 appliquées)** — `create_member_with_pending_subscription` recréé **sans** `SECURITY DEFINER` + check `role = 'admin'` (la correction de 00027 avait été écrasée par 00060) ; `finalize_subscription_payment` → check `role = 'admin'` (suppression référence `super_admin`) ; drop de l'overload 13 params orphelin `SECURITY DEFINER` (00009) → `prosecdef = false` vérifié sur les 2 RPCs restants
- **Bug S-H3** — `recovery.tsx:131` lit désormais `data.newCode` (l'EF `reset` renvoie `newCode`, pas `newRecoveryCode`) → nouveau code affiché correctement
- **Bug F-7** — `members.tsx` lit `?q=` via `useSearchParams` → recherche navbar fonctionnelle (init `search`/`debouncedSearch` depuis l'URL)
- **Bug F-6** — `navbar.tsx` importe `useQuery`/`useMutation`/`useQueryClient` depuis `@/hooks/useQuery`
- **Déploiement Vercel** — ErrorBoundary auto-reload sur chunk dynamique périmé (stale PWA) + `cleanupOutdatedCaches` ; déploiement prod https://qlfgym.vercel.app ✅
- **Recherche adhérent + WhatsApp** — page notifications : barre de recherche par nom/téléphone (flux général, renouvellements, expirés), bouton WhatsApp dans chaque carte de notification ; page membres : bouton WhatsApp (template renouvellement pré-rempli) à côté de chaque membre
- **Cloche navbar** — popover notifications agrandi (`w-96`, `max-h-96`, 8 notifications affichées)
- **B1 PNGs** — `QLG_3D-removebg-preview.png` redimensionné 707×353/181.6KB → 384×192/67.9KB (`-opt.png`, origine supprimée), sign-in branché ; dist 4523→4410 KiB
- **Déploiement Vercel 13/08/2026** — branche `deploy/member-insights` déployée en prod (member-insights, noImplicitAny C1, dialogue notif, store IA partagé) → https://qlfgym.vercel.app ✅
- **Paie — Bonus exceptionnel** : champ BONUS « prime exceptionnelle » par employé dans `rh.tsx` (colonne `staff.bonus` existante via 00051) — éditable admin, sauvegardé avec salaire (autosave), badge bonus dans la liste staff, ligne « Total salaire » = fixe + bonus
- **Assistant IA — Bonus intégré** : `useAssistantData.ts` somme les `staff.bonus` actifs et les ajoute aux dépenses salariales (`totalExpenses`) → impacte le bénéfice net, KPI et synthèse
- **Fix UI — Synthèse intelligente** : `insights-section.tsx` textes passés en `text-foreground` (noir) au lieu de `text-*-foreground` blancs sur fonds teintés 10% (illisibles) ; action `opacity-80` → noir plein
- **Thème Premium Pro (uiverse.io)** : palette retravaillée (`index.css` — light `#f7f8fc`/`#101828`, dark navy `#0b0f1a`, `--radius` 0.75rem, primary dark `#2563eb`) ; boutons gradient + glow + lift + shine (`button.tsx`, utilitaire `.btn-shine`) ; cards ombre 2 couches + hover lift (`.card-shadow`/`.card-shadow-hover`) ; inputs focus glow (`border-primary/50` + ring) ; ombres `glow-primary`/`glow-destructive` dans `tailwind.config.js` — aucun changement fonctionnel
- **Boutons Premium v2 (uiverse.io)** : couleurs refondues light+dark dans `button.tsx` — default **blue→indigo** glossy `#3b82f6→#2563eb→#4f46e5` (dark `#60a5fa→#3b82f6→#6366f1`), destructive dégradé rouge avec inset highlight, secondary **glass** (`indigo-50`/`white/5`), outline **Stripe-like**, ghost/`link` adaptés au mode ; `.btn-shine` overlay adapté dark (blanc 0.4 light / 0.18 dark) ; focus ring `primary/50`

### In Progress
- Intégration des anomalies de l'audit (reste : sign-in i18n F-4 intentionnel) — F-4 assumé, G2 terminé

### Blocked
- **(none)**

## Latest (29/08/2026)
- **Robot IA flottant (QLF premium, ÉTAPE 6)** — **robot statique premium 2.5D** (`ai-robot.tsx` ~532 lignes, SVG `viewBox 0 0 116 156`, monté dans `AppLayout`, CSS `.qlf-*` index.css ~lignes 256+) : **aucun déplacement/rotation/grandissement/entraînement** — aéronaute bleu nuit + bleu électrique (armure 6 stops `qlfArmor`/`qlfArmorDark`, chrome `qlfMetal`, reflets, jointures lumineuses cyan, aileron crête + antenne, pods latéraux, visière, sourcils/menton lueurs, logo QLF au cœur du torse `qlfCore`+halo, bottes à liseré) ; **micro-mouvements uniquement** : respiration très légère `.qlf-breathe` (scale 1.005), **yeux → souris** (`--eye-lx/ly`+`--eye-rx/ry`, convergence + inertie 0.14 + micro-saccades sin/cos, rAF) + **clignement occasionnel** `.qlf-blink` (3,2–7,2 s, 160 ms) ; **lueur statique élégante sous les pieds** : halo `qlfFire` + 2 éventails `.qlf-fan` + 4 particules `.qlf-spark` (opacité seulement, prog. sans déplacement) ; **clic robot = fenêtre IA flottante** (plus de nav `/ai-assistant`) réutilisant `ChatSection` (embedded) + `useAiChat` + `useAssistantData` — panel persistant à la navigation ; drag/tactile + localStorage `qlf-robot-pos` + clavier Entrée/Espace conservés ; classes obsolètes supprimées (`.is-idle/.is-observe/.is-training/.is-rest/.is-grow`, `--qlf-rot`, `--qlf-fire`, `.qlf-pupil-*`, `.qlf-fire-glare/blue/outer/core`, `.qlf-arm-l/r`) ; reduced-motion à jour — tsc ✅ zéro erreur, vitest ✅ 181/181, build ✅ (126 precache)
- **Remise corporate POS terminée** — migration 00060 appliquée, CRUD corporate Supabase, remise auto sur abonnement au POS (retirable), `subscriptionPaid` transmis aux RPCs
- **Migration 00044 - Dépenses** — table `expenses` (10 catégories), RLS (admin CRUD, staff read-only), indexes — appliquée Supabase
- **Page Dépenses `/expenses`** — CRUD, catégories, import/export Excel, filtres, résumé Total · nbr entrées, responsive
- **Migration 00045 - Lien Salaires→Dépenses** — trigger `sync_salary_payment_to_expense`, colonnes `reference_type`/`reference_id` sur `expenses`, backfill — appliquée Supabase
- **Migration 00046 - Rentabilité** — tables `investments` (9 catégories RLS) + `profitability_objectives` (monthly/yearly) — appliquée Supabase
- **Refactor Assistant Comptable** — Architecture 8 modules : hook `useAccountingData` + 6 composants (KPI, Revenus, Dépenses, Historique, Journaux, Alertes) + page principale
- **Agrégation multi-sources** — Revenus depuis `payments` (abonnements) + `pos_transactions` (ventes), dépenses depuis `expenses` (10 catégories)
- **6 journaux comptables** — Ventes, Dépenses, Encaissements, Grand Livre, Balance Générale, TVA (19% collectée/déductible)
- **Module Rentabilité & Profitabilité `/rentabilite`** — 13 agents parallèles, 10 composants :
  - `useProfitabilityData` hook : 11 requêtes Supabase + calculs ROI/marges/prévisions/insights
  - KpiCards (6 KPI), RevenueSection (CA par source), ProfitSection (brut/net/marges)
  - InvestmentSection (catégories + ROI), ProfitabilityBreakdown (7 onglets)
  - ForecastsSection (6 prévisions IA), ObjectivesSection (4 objectifs)
  - ChartsSection (6 graphiques recharts), AiInsights (8 règles d'analyse)
- **Fix TypeScript** — generics `useQuery<T>` retirés, casts `unknown` résolus — `npx tsc --noEmit` ✅ zéro erreur
- **Commit `231bc83`** + `3a93849` + `bd436bb` + `acb3818` poussés sur GitHub
- **Phase 1 — Bug critique récupération (EF)** : `_shared/crypto.ts` `generateCode()` majuscules uniquement (plus d'ambiguïté 0/O, 1/I) ; `recovery/index.ts` garde de longueur dans `hashEqual` avant `timingSafeEqual` ; `types/supabase.ts` `members.user_id` + `recovery_code_logs.action` (+ bloc corrigé avec `Relationships: []` — absence cassait le typage de toutes les tables en `never[]`) ; `AbortSignal.timeout(10000)` ajouté sur 5 fetch (auth.tsx, sign-in.tsx, recovery.tsx ×2, users.tsx)
- **Phase 2 — Fluidité (client, comportement identique)** : dashboard `REALTIME_DEBOUNCE = 4000` (9 channels) + `refetchInterval` supprimé + 8 counts `'exact'`→`'estimated'` + selects réduits ; payments.tsx select réduit ; `useAccountingData` consolidé (boucle 6 mois 18 requêtes séquentielles → 3 requêtes `ac-monthly` partitionnées en JS, 9 requêtes résumées daily/week/month → 3 requêtes union `ac-summary-*` partitionnées en JS) ; `main.tsx` `staleTime` 120s + `persistFilter` `SKIP_PERSIST` excluant 9 keys lourdes du cache localStorage (anti-quota 5MB)
- **Phase 3 — Sécurité/perf SQL — migration `00109_fluidity_fixes.sql` (déployée)** : RPC `get_member_attendance_counts(p_org_id)` (SECURITY DEFINER + `SET search_path = public` + garde `is_org_member`, réplique SQL du compte JS via `DISTINCT ON` dernière souscription + `check_in BETWEEN start_date AND end_date`) remplaçant le select complet de `attendance` côté client ; 3 index composites (`members(org,phone)`, `attendance(org,check_in)`, `payments(org,payment_date)`) ; fix statut fantôme `'trial'` dans `phone_check_in` (le CHECK ne l'autorise jamais) ; `SET search_path = public` sur 8 RPCs `SECURITY DEFINER` sensibles (RFID + dashboard + roster)
- **Correction EF CORS** : `recovery`, `sign-in-with-recovery`, `send-subscription-reminder` — le guard `POST` interceptait `OPTIONS` avant le bloc 204 (préflight CORS → 405, bloc 204 mort) ; réordonnées comme `ai-chat`/`send-payment-reminder` (OPTIONS en premier)
- **Migration `00109` poussée** sur Supabase (Local = Remote = 00109) — dépôt via `supabase db push` ; `00104_fix_cron_jobs_url.sql` déjà appliquée (crons 8h/9h programmés) ; secrets EF déjà définis sur le projet (`OPENROUTER_API_KEY`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`)
- **G2 — Workflow CI PR** — `.github/workflows/pr.yml` créé, committé et poussé sur GitHub (CI sur PR master/develop : `npm ci` → `tsc` → `vitest` → `build`, job Vercel preview commenté) ; protection `master` active (1 review + check `ci` strict requis, historique linéaire, force-push/suppression bloqués) ; `develop` fast-forwardé au niveau de `master`

## Key Decisions
- `SECURITY DEFINER` retiré au lieu d'ajouter un check explicite dans `renew_subscription` : RLS s'applique automatiquement au caller
- Trigger `after_organization_insert` plutôt que client-side `user_roles.insert()` : garantit que le rôle `admin` est créé même si le client est modifié
- `localStorage` plutôt qu'IndexedDB pour la persistance du cache : API synchrone, limite 5MB suffisante
- `networkMode: 'offlineFirst'` plutôt que `'online'` : mutations automatiquement mises en pause et rejouées
- VitePWA Workbox `NetworkFirst` plutôt que `CacheFirst` pour l'API Supabase
- **Migration 00009** : les RPCs sont `SECURITY DEFINER` pour s'affranchir des contraintes RLS sur les tables membres/subscriptions/paiements ; le verrouillage `FOR UPDATE` dans `finalize_subscription_payment` empêche la double-activation
- **POS redirection** : passage via `location.state` React Router plutôt que stockage local ou URL params — évite la persistance après refresh, pas de fuite dans l'URL
- **Article virtuel** : préfixe `__subscription__` dans `product.id` pour distinguer les articles d'abonnement des produits physiques dans le panier
- **Migration 00041** : `coach_default_salary` et `coach_default_rate_per_member` stockés dans `organizations` (paramètres globaux, pas per-coach)
- **Remise convention** : appliquée uniquement au paiement d'abonnement (`__subscription__` + `__renewal__`), produits physiques et séances libres exclus ; auto si membre avec carte active + contrat en cours, retirable par ✕ sur la vente
- **Assistant IA** : moteur règles locales (aucune clé API, hors-ligne, testable), prévisions par régression linéaire + saisonnalité, insights/actions via clés i18n paramétrées `{param}` — cohérent avec rentabilite/assistant-comptable

## Next Steps
- Test manuel navigateur (Ctrl+Shift+R) : `/ai-assistant` (KPIs, actions P0/P1/P2, graphique heures, produits phares, prévisions confiance, insights EN/AR/FR) + test corporate POS (adhérent avec carte → panier abonnement → remise auto/retirable → paiement RPC montant remisé) + recherche navbar (`/members?q=`) + `/member-insights` (KPIs, churn, segments, matrice, fréquentation)
- ✅ Bug rentabilite corrigé : filtre `organization_id` sur `class_enrollments` (`useProfitabilityData.ts:260` via `classes!inner`) + clés i18n rentabilite FR/AR/EN complètes
- ✅ Corriger les anomalies restantes (F-4 sign-in i18n intentionnel, G2 branches Git) — F-4 resté intentionnel ; G2 : workflow `pr.yml` poussé sur GitHub + protection `master` active + `develop` fast-forwardé
- ✅ Configurer les variables d'env Edge Functions — déjà définies sur le projet (secrets list : OPENROUTER_API_KEY, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY présents)
- ✅ Remplacer `SUPABASE_PROJECT_REF` dans `00004_cron_jobs.sql` — fait par `00104_fix_cron_jobs_url.sql` déjà appliquée (crons 8h/9h actifs)

## Critical Context
- `npx tsc --noEmit` ✅ zéro erreur (`noImplicitAny: true`)
- `npx vitest --run` ✅ 181/181 tests (utils, recovery, auth, ai-assistant lib, member-insights lib, pointage)
- `npx vite build` ✅ succès
- Migrations `00001`→`00109` — toutes appliquées remote (dont 00109 fluidité, 00100 sécurité RPC, 00061/00062 sécurité, 00060 corporate, 00059 admin)
- 8 Edge Functions déployées : ai-chat, recovery, sign-in-with-recovery, send-subscription-reminder, send-payment-reminder, create-notification, send-staff-invitation, admin-manage-users — `ai-chat` requiert le secret `OPENROUTER_API_KEY` (défini)
- Le bucket `photos` Supabase Storage doit exister pour l'upload des avatars
- RLS role-based : `admin` peut tout modifier, `coach`/`staff` sont en lecture seule
- Le recovery code est affiché côté serveur (pas de canal email/SMS implémenté)
- Cache offline : localStorage clé `FITMANAGER_QUERY_CACHE` (maxAge 24h)
- Mutations offline : mises en pause automatiquement, rejouées au retour réseau
- **Workflow POS redirection** : création membre → sélection abonnement → redirection `/pos` → checkout → activation abonnement + enregistrement paiement en une transaction atomique DB
- **Dépenses** : 10 catégories, synchro auto depuis salaires (trigger), CRUD complet
- **Assistant Comptable** : agrège payments + pos_transactions + expenses (pas de saisie manuelle)
- **Rentabilité** : ROI calculé depuis investissements, prévisions IA (moyenne mobile 3 mois), 6 graphiques recharts, insights IA
- **Assistant IA** : moteur règles locales, prédictions régression + saisonnalité (confiance 0-100), actions P0/P1/P2, i18n FR/AR/EN — rien de mocké

## Relevant Files
- `supabase/migrations/00001_init.sql` → schéma initial (22 tables, RLS, trigger auto_assign_owner_role, user_roles INSERT policy restreinte)
- `supabase/migrations/00002_recovery_codes.sql` → recovery + logs + RLS
- `supabase/migrations/00003_indexes.sql` → 36 indexes FK
- `supabase/migrations/00004_cron_jobs.sql` → pg_cron schedules
- `supabase/migrations/00005_staff_shifts.sql` → table staff_shifts + RLS
- `supabase/migrations/00006_payment_trigger.sql` → trigger amount_paid sync
- `supabase/migrations/00007_renew_subscription.sql` → RPC renewal (SECURITY DEFINER retiré)
- `supabase/migrations/00008_atomic_stock_decrement.sql` → RPC atomique POS
- `supabase/migrations/00009_subscription_payment_flow.sql` → pending_payment status, RPCs create_member_with_pending_subscription / finalize_subscription_payment
- `supabase/migrations/00044_expenses.sql` → table `expenses` (10 catégories, RLS)
- `supabase/migrations/00045_link_salary_expenses.sql` → trigger sync salaires→dépenses
- `supabase/migrations/00046_profitability.sql` → tables `investments` + `profitability_objectives`
- `supabase/migrations/00059_remove_super_admin.sql` → rôle `super_admin` fusionné dans `admin` (RLS équivalentes)
- `supabase/migrations/00060_corporate_discount.sql` → remise corporate POS (members.corporate_id, seed conventions, RPC p_corporate_id)
- `supabase/functions/recovery/index.ts` → Edge Function recovery
- `supabase/functions/send-subscription-reminder/index.ts` → Edge Function rappel abonnement
- `supabase/functions/send-payment-reminder/index.ts` → Edge Function rappel paiement
- `src/main.tsx` → QueryClient config (offlineFirst), PersistQueryClientProvider, OfflineBanner
- `src/vite.config.ts` → VitePWA Workbox runtime caching NetworkFirst
- `src/stores/auth.tsx` → signUp, signOut, slug collision, useMemo ctxValue, user_roles.insert() supprimé
- `src/stores/theme.tsx` → ThemeProvider avec useCallback/useMemo
- `src/i18n/index.tsx` → I18nProvider avec useMemo ctxValue
- `src/i18n/en.ts` → clés `pos.subscriptionRedirect`, `pos.pendingSubscription`, `pos.finalizeSubscription`, `pos.subscriptionPaymentDesc`, `nav.groups.rh`, `nav.payroll`, `rh.*`, `expenses.*`, `assistantComptable.*`, `rentabilite.*`, `corporate.*`, `aiAssistant.*`
- `src/i18n/fr.ts` → clés `nav.groups.rh`, `nav.payroll`, `rh.*`, `expenses.*`, `assistantComptable.*`, `rentabilite.*`, `corporate.*`, `aiAssistant.*`
- `src/hooks/useNetworkStatus.ts` → hook isOnline/recovering
- `src/components/ui/offline-banner.tsx` → bannière offline/online
- `src/components/layout/navbar.tsx` → avatar/user branchés sur useAuth, locale debug supprimé
- `src/components/layout/ai-robot.tsx` → robot IA flottant global (orb, panneau, states idle/thinking/offline)
- `src/stores/ai-chat.tsx` → store partagé du chat IA (AiChatProvider + useAiChat, historique unique)
- `src/components/layout/sidebar.tsx` → avatar/user branchés sur useAuth, logout onClick signOut, items `expenses`, `assistantComptable`, `rentabilite`, `corporate`, `aiAssistant`
- `src/pages/expenses/expenses.tsx` → CRUD Dépenses complet
- `src/pages/assistant-comptable/assistant-comptable.tsx` → tableau de bord comptable (8 modules)
- `src/pages/assistant-comptable/hooks/useAccountingData.ts` → agrégation données comptables
- `src/pages/assistant-comptable/components/*.tsx` → 6 composants (KPI, Revenus, Dépenses, Historique, Journaux, Alertes)
- `src/pages/rentabilite/rentabilite.tsx` → page principale Rentabilité & Profitabilité
- `src/pages/rentabilite/hooks/useProfitabilityData.ts` → agrégation + calculs ROI/marges/prévisions/insights (11 requêtes)
- `src/pages/rentabilite/hooks/types.ts` → interfaces partagées
- `src/pages/rentabilite/components/*.tsx` → 10 composants (KPI, CA, Profit, Investissements, Breakdown, Forecasts, Objectives, Charts, Insights)
- `src/pages/ai-assistant/` → Assistant IA complet (page, `useAssistantData` 9 queries, composants recharts)
- `src/pages/ai-assistant/lib/` → moteur pur (peakHours, flagshipProducts, subscriptionInsights, forecast, recommendations, insights) + 5 fichiers de tests
- `src/pages/corporate/corporate.tsx` → CRUD conventions corporate (Supabase)
- `src/pages/coach-mode/coach-mode.tsx` → salaire coach lecture seule, gestion des adhérents, historique salaires
- `src/pages/coach-portal/coach-portal.tsx` → configuration salaires admin : Fixe + Prime/adh éditables, sauvegarde dans `organizations`
- `src/pages/members/members.tsx` → ajout sélecteur abonnement + date début dans le formulaire, RPC create_member_with_pending_subscription, redirection vers `/pos` avec state
- `src/pages/pos/pos.tsx` → détection pendingSubscription, ajout article virtuel abonnement, finalize_subscription_payment RPC après checkout
- `src/pages/rh/rh.tsx` → Paie & RH : staff list, 3 onglets (Salaire éditable avec Bonus exceptionnel, Paiements historique, Congés), mutations inline admin
- `src/types/supabase.ts` → member_subscriptions.status inclut `pending_payment`, StaffSalaryPayment, Expense, Investment, ProfitabilityObjective

## Audit Findings (Juillet 2026 — 6 phases, 60+ anomalies)

> Rapport complet : `.opencode/plans/audit-juillet-2026.md`

### Anomalies Critiques (10)

| ID | Phase | Constat | Statut |
|----|-------|---------|--------|
| S-C1 | Sécurité | 6/6 Edge Functions sans vérification JWT — utilisent `service_role` statique sans valider le caller | ✅ Corrigé (5 EFs + JWT, recovery/sign-in publics) |
| B-1 | Backend | RPCs `SECURITY DEFINER` (`create_member_with_pending_subscription`, `finalize_subscription_payment`) sans autorisation rôles — tout user auth peut créer membres/abonnements/paiements | ✅ Corrigé (migrations 00061 + 00062) |
| S-C2 | Sécurité | `xlsx` vulnérable CVE Prototype Pollution + ReDoS | ✅ Corrigé (remplacé par `exceljs`) |
| B-3 | Backend | Recovery code exposé en clair dans réponse HTTP (`send_code`, `reset`) | ⚠️ Assumé (pas de canal email/SMS, affiché côté client) |
| B-2 | Backend | `send-payment-reminder` utilise type `payment_pending` inexistant dans CHECK constraint (doit être `payment_overdue`) — INSERT échoue toujours | ✅ Corrigé |
| F-1 | Frontend | Double ErrorBoundary (main.tsx inline + App.tsx import) — fallback inutilisable | ✅ Corrigé (unique + auto-reload chunk périmé) |
| F-2 | Frontend | `fr.ts` : section `profile` entièrement manquante (21 clés) — pages profil affichent clés brutes | ✅ Corrigé |
| F-3 | Frontend | `fr.ts` : 21 clés `settings` manquantes — page settings affiche clés brutes | ✅ Corrigé |
| P-1 | Perf | `LOGO QLForiginal.png` = 1.74 MB — 40% du dist total, LCP dégradé | ✅ Corrigé (87 KB + webp 37 KB) |
| P-2 | Perf | 3 icons PWA manquantes (favicon.ico, pwa-192x192, pwa-512x512) — PWA non installable | ✅ Corrigé |

### Anomalies Hautes (13)

| ID | Phase | Constat | Statut |
|----|-------|---------|--------|
| S-H1 | Sécurité | CORS `*` sur toutes les EFs — CSRF possible depuis n'importe quel site | ✅ Corrigé (whitelist origines) |
| S-H2 | Sécurité | `listUsers` paginé à 100 dans EF recovery — codes non générés au-delà | ✅ Corrigé (boucle paginée) |
| S-H3 | Sécurité | `recovery.tsx:131` lit `data.newRecoveryCode` mais EF retourne `newCode` — nouveau code jamais affiché | ✅ Corrigé |
| B-4 | Backend | Comparaison hash SHA-256 non constant-time (`reduce` short-circuite) — timing attack | ✅ Corrigé (`timingSafeEqual`) |
| B-5 | Backend | Photos bucket Storage sans restriction — tout user peut lire/modifier/supprimer toutes les photos | ✅ Corrigé (RLS org-based) |
| F-4 | Frontend | Page sign-in non i18n (toutes chaînes hardcodées français) | ⚠️ Intentionnel (page login finalisée FR) |
| F-5 | Frontend | OfflineQueue non persistée (`useState([])`) — perte mutations offline au refresh | ✅ Corrigé (localStorage) |
| F-6 | Frontend | Navbar import `@tanstack/react-query` direct au lieu de `@/hooks/useQuery` | ✅ Corrigé |
| F-7 | Frontend | Navbar champ Search non fonctionnel | ✅ Corrigé (membres lit `?q=`) |
| F-8 | Frontend | Settings "Save" ne fait que `toast()` — aucune écriture DB | ✅ Corrigé |
| G2 | Git | Aucune branche secondaire — tout sur master, pas de workflow PR | ✅ Corrigé (workflow CI `pr.yml` + protection master + branches develop/feature) |
| B1 | Git/Deps | 2 PNGs non optimisées (LOGO 1.82MB + QLG_3D 186KB) = 40% du dist | ✅ Corrigé (LOGO webp 37KB + QLG_3D redimensionné 67.9KB, origine supprimée) |
| C1 | Build | `noImplicitAny: false` — masque erreurs de typage TypeScript | **À corriger** |

### Score Global : 3.6/10

| Catégorie | Score | Pire Anomalie |
|-----------|-------|---------------|
| Sécurité | 2/10 | EFs sans vérification JWT |
| Backend | 3/10 | RPCs SECURITY DEFINER ouverts |
| Frontend | 4/10 | ErrorBoundary cassé + i18n incomplet |
| Performance | 4/10 | Logo 1.74 MB (40% dist) |
| Git/Deps/Build | 5/10 | Tout sur master |

### Priorités de correction
1. **IMMÉDIAT (6h)** : JWT validation EFs, RPCs authorization, xlsx CVE, recovery code exposure, hash constant-time, payment-reminder fix
2. **HAUTE (6h)** : i18n fr.ts, ErrorBoundary, recovery.tsx fix, Settings DB, OfflineQueue persist, Search fix, Photos RLS, CORS
3. **MOYENNE (10h)** : Logo compression, PWA icons, framer-motion lazy, Dashboard N+1, sign-in i18n, tsconfig strict, Git branches

## Latest (07/09/2026)
- **Crise corruption volume `M:` + changement de source** — le disque `M:\` corrompt les fichiers en temps réel (17 fichiers source/migrations remplis de NULs — `members.tsx`, `pointage.tsx`, `main.tsx`, `auth.tsx`, `dashboard.tsx`, `useAccountingData.ts`, `useProfitabilityData.ts`, migrations 00112/00113...) et l'objet git `47dbf22` était corrompu localement sur `M:`. Décision : **`M:` gelé en lecture seule** (ne rien y écrire). La source canonique est désormais **`C:\Users\wahra\Desktop\dinatek`** (tout est enregistré là + Supabase + GitHub). Le contenu était déjà poussé sur GitHub avant la corruption ; la copie `C:` a été ramenée à `47dbf22` (fast-forward depuis origin, arbre sain, 0 corruption). Backups sains : `C:\Users\wahra\Documents\Default Project\` (`fix-encaissements-07-09`, `fix-subscription-dates-07-09`, `etat-31-08`, `rfid-fix`).
- **Fix Encaissements (commit `47dbf22`)** — dédoublonnage abonnements POS dans dashboard/compta/rentabilité : util `src/lib/ledger-dedupe.ts` (+16 tests), `dashboard.tsx`, `useAccountingData.ts`, `useProfitabilityData.ts`, `encaissement.tsx` ; migration `00113_invoice_sequences_rls.sql` appliquée (RLS activée, policy `staff_read_invoice_sequences`).
- **Modifier la date d'abonnement (commit `0bd4f3d`)** — fonctionnalité sur la fiche membre, réservée à **admin + receptionist** :
  - Migration `00114_subscription_dates_edit.sql` (appliquée) : helper `is_admin_or_receptionist(p_org_id)` + RPC `update_subscription_dates(p_subscription_id, p_organization_id, p_start_date, p_end_date)` RETURNS jsonb — check de rôle serveur (pas SECURITY DEFINER, RLS appliquée), verrou `FOR UPDATE`, dates obligatoires + `start <= end`, recalcul statut `active`/`expired` selon `end_date` vs `CURRENT_DATE` (préserve `pending_payment`/`cancelled`), réactivation membre `inactive → active` si l'abonnement redevient actif (précédent 00106).
  - UI : nouveau `src/pages/members/edit-subscription-dates.tsx` (`EditSubscriptionDatesDialog` — dates préremplies, `<Input type="date">`, validation client, `useMutation` RPC, invalidation queries, toast) ; `member-profile.tsx` : bouton « Modifier la date » dans la carte abonnement (visible seulement si `roles` contient `admin`/`receptionist` de l'org + abonnement avec id), dialog rendu hors `DialogContent` (fragment racine).
  - i18n FR/EN/AR : clés `members.profile.editSubscriptionDate*`.
  - Vérifs : `npx tsc --noEmit` ✅ zéro erreur, `npx vitest --run` ✅ (1 test flaky connu non lié : `diagnostic.test.ts` « generates unique IDs » — suffixes 4-hex 16 bits, 3/3 passes au re-run), `npx vite build` ✅ (128 precache).
- **Module COACH complet (commit `e3e2bc8`)** — coach ↔ membre ↔ séances ↔ PAIE & RH :
  - Migration `00115_coach_sessions.sql` (appliquée + enregistrée dans `supabase_migrations`) : table `coach_sessions` (organization_id, coach_id→staff, member_id→members, session_date, start_time, end_time, session_type, room, status CHECK `scheduled|done|cancelled|no_show` DEFAULT 'scheduled', notes, created_by, created_at), 3 index (org+date, coach+date, member+date), RLS : admin gestion totale, coach gestion de SES séances (via `staff.user_id`), lecture org-entier (staff/receptionist/cleaner). Les gabarits hebdo `classes`/`class_enrollments` et `staff_shifts` restent inchangés.
  - `coach-mode.tsx` : onglet **Séances** (liste membre/date/heure/type/salle/statut, CRUD dialog admin + coach propriétaire, badges statut, suppression) ; requête coaches enrichie d'un **`active_count`** → les cartes et le total affichent désormais `Fixe + (Prime/adh × adhérents ACTIFS) + Bonus` (cohérent avec l'onglet salaire).
  - `rh.tsx` : pour un coach, « Clôture de paie » — sélecteur **mois/année**, affichage `Adhérents actifs` (count membres `active` affiliés), détails Fixe / Prime (taux×adhérents) / Bonus / **Salaire brut**, bouton **« Valider la paie »** (admin) : upsert `coach_salary_history` (snapshot immuable coach_id+période : fixe, taux, membres, variable, total) + insertion `staff_salary_payments` si aucune déjà pour (staff, période) → dépense auto (trigger 00045) ; détail des composantes affiché aussi dans la config salaire ; badge « Déjà validée » si snapshot période + mini-historique.
  - **Formule** : `Salaire brut = Salaire fixe + (nb adhérents actifs affiliés × prime par adhérent) + bonus exceptionnel` — calcul auto depuis la BD (pas de saisie manuelle du nombre), snapshot par période immuable, historique conservé.
  - **EF `admin-manage-users`** : `allowedRoles` élargis à `['staff','coach','admin','receptionist','cleaner']` sur le path **create** ET **update** (création du compte « Réception » via Admin → Utilisateurs désormais possible) — **EF REDÉPLOYÉE** (token `SUPABASE_ACCESS_TOKEN` fourni par l'utilisateur le 07/09) ; clés i18n `coachMode.*` + `rh.*` nouvelles en FR/EN/AR (sections ajoutées aussi en arabe).
  - Vérifs : tsc ✅, vitest ✅ 216/216, build ✅ (128 precache), migration vérifiée (table 1 + 3 policies + 4 index).
- **Adhérents par noms sur les cartes coach (commit à venir)** — la requête `coaches-with-count` sélectionne désormais les noms des membres affiliés (`first_name, last_name, coach_id, status`) ; chaque carte coach affiche en bas les **noms des adhérents affiliés** triés alphabétiquement (jusqu'à 3 + « +N » ou « Aucun adhérent affilié »), en plus du badge de comptage et du total salaire. `M:` rétabli jour 07/09 (8 fichiers corrompus restaurés depuis C:), et `C:` déclaré source de développement unique.

## Critical Context (mise à jour 07/09/2026)
- Chemin de travail canonique : `C:\Users\wahra\Desktop\dinatek` (branche `deploy/member-insights`, remote `https://github.com/qlfgym1-stack/qlfgym.git`).
- Supabase : migrations appliquées jusqu'à `00115` ; Edge Functions 8 déployées (dont `ai-chat` avec secret `OPENROUTER_API_KEY`).
- ⚠️ **EF `admin-manage-users`** : rôles `['staff','coach','admin','receptionist','cleaner']` (create + update) **REDÉPLOYÉE** ✅. Compte réceptionniste à créer via Admin → Utilisateurs (rôle « Réception » ; username requis → login `<username>@staff.local`).
- Le test `diagnostic.test.ts` de `generateDiagId` est intrinsèquement flaky (collision sur 4 hex chars, ~2%) — à fiabiliser plus tard si besoin (suffix plus long ou timestamp avec ms).
