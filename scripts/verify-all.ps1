<#
  verify-all.ps1 — Controle de completude apres chaque correction.

  Verifie, dans l'ordre : arbre local, sync GitHub, typage, tests, build,
  migrations Supabase (local vs remote), Edge Functions, et deploiement Vercel
  en production (alias + build reellement servi).

  Usage :
    powershell -ExecutionPolicy Bypass -File scripts\verify-all.ps1
    powershell -ExecutionPolicy Bypass -File scripts\verify-all.ps1 -SkipBuild

  Sortie : une ligne "OK" ou "NON" par poste, puis un verdict global.
  Code de sortie 0 si tout est OK, 1 sinon.
#>
param([switch]$SkipBuild)

$ErrorActionPreference = "Continue"
$results = @()
function Add-Check($name, $ok, $detail) {
  $script:results += [pscustomobject]@{ Poste = $name; Ok = $ok; Detail = $detail }
}
function Section($t) { Write-Output ""; Write-Output "=== $t ===" }

Write-Output "VERIFICATION COMPLETE - $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')"

# --- 1. Arbre local ---------------------------------------------------------
Section "1. Arbre local"
$dirty = git status --porcelain
if ($dirty) {
  Add-Check "1. Arbre local" $false "fichiers non commites : $(($dirty | Measure-Object).Count)"
  $dirty | ForEach-Object { Write-Output "    $_" }
} else {
  Add-Check "1. Arbre local" $true "aucune modification non commit"
  Write-Output "OK"
}

# --- 2. Branche et sync GitHub --------------------------------------------
Section "2. Git / GitHub"
$branch = git rev-parse --abbrev-ref HEAD
$head   = git log --oneline -1
Write-Output "branche : $branch"
Write-Output "HEAD    : $head"
git fetch origin 2>&1 | Out-Null
$ahead   = [int](git rev-list --count "origin/$branch..HEAD")
$behind  = [int](git rev-list --count "HEAD..origin/$branch")
if ($ahead -eq 0 -and $behind -eq 0) {
  Add-Check "2. Git / GitHub" $true "local identique a origin/$branch"
  Write-Output "OK - synchronise"
} else {
  Add-Check "2. Git / GitHub" $false "ahead=$ahead behind=$behind"
  Write-Output "NON - ahead=$ahead (non pousse), behind=$behind (non recupere)"
}

# --- 3. Typage --------------------------------------------------------------
Section "3. TypeScript"
$tsc = npx tsc --noEmit 2>&1 | Out-String
if ($tsc -match "error TS") {
  Add-Check "3. TypeScript" $false "erreurs TS"
  Write-Output "NON - erreurs TS"
  ($tsc -split "`n" | Select-String "error TS" | Select-Object -First 10) | ForEach-Object { Write-Output "    $_" }
} else {
  Add-Check "3. TypeScript" $true "aucune erreur"
  Write-Output "OK"
}

# --- 4. Tests ---------------------------------------------------------------
Section "4. Tests (vitest)"
$vitest = npx vitest --run 2>&1 | Out-String
# PowerShell 5.1 n'a pas d'escape pour ESC : on le construit explicitement.
$esc = [char]27
$plain = $vitest -replace "$esc\[[0-9;]*[A-Za-z]", ""
$passed = [int]([regex]::Match($plain, "Tests\s+(\d+)\s+passed").Groups[1].Value)
$failed = [int]([regex]::Match($plain, "(\d+)\s+failed").Groups[1].Value)
if ($failed -eq 0 -and $passed -gt 0) {
  Add-Check "4. Tests" $true "$passed/$passed"
  Write-Output "OK - $passed tests passes"
} else {
  Add-Check "4. Tests" $false "$failed echec(s)"
  Write-Output "NON - $passed passes, $failed echecs"
  ($plain -split "`n" | Select-String "FAIL" | Select-Object -First 10) | ForEach-Object { Write-Output "    $_" }
}

# --- 5. Build ---------------------------------------------------------------
if ($SkipBuild) {
  Section "5. Build"
  Add-Check "5. Build" $true "ignore (-SkipBuild)"
  Write-Output "IGNORE"
} else {
  Section "5. Build (vite)"
  $build = npx vite build 2>&1 | Out-String
  if ($build -match "built in" -and $build -notmatch "error during build") {
    $entries = [regex]::Match($build, "precache\s+(\d+) entries").Groups[1].Value
    Add-Check "5. Build" $true "precache $entries entrees"
    Write-Output "OK - build reussi (precache $entries entrees)"
  } else {
    Add-Check "5. Build" $false "build en echec"
    Write-Output "NON - build en echec"
  }
}

# --- 6. Migrations Supabase -------------------------------------------------
Section "6. Migrations Supabase (local vs remote)"
$mig = npx supabase migration list 2>&1 | Out-String
# Une migration presente en local mais absente en remote sort comme "remote":"".
$nonAppliquees = ([regex]::Matches($mig, '"local":"\d+","remote":""')).Count
$toutes = [regex]::Matches($mig, '"local":"(\d+)"')
if ($toutes.Count -eq 0) {
  Add-Check "6. Migrations" $false "liste illisible"
  Write-Output "NON - impossible de lire la liste des migrations"
} elseif ($nonAppliquees -eq 0) {
  $dernierNum = $toutes[$toutes.Count - 1].Groups[1].Value
  Add-Check "6. Migrations" $true "derniere $dernierNum appliquee"
  Write-Output "OK - $($toutes.Count) migrations, toutes appliquees (derniere $dernierNum)"
} else {
  Add-Check "6. Migrations" $false "$nonAppliquees non appliquee(s)"
  Write-Output "NON - $nonAppliquees migration(s) locale(s) non appliquee(s) en remote"
}

# --- 7. Edge Functions ------------------------------------------------------
Section "7. Edge Functions (backend)"
$fn = npx supabase functions list 2>&1 | Out-String
$slugs = [regex]::Matches($fn, '"slug":"([^"]+)","name":"[^"]*","status":"([^"]+)"')
if ($slugs.Count -eq 0) {
  Add-Check "7. Edge Functions" $false "liste illisible"
  Write-Output "NON - impossible de lister les fonctions"
} else {
  $inactives = @($slugs | Where-Object { $_.Groups[2].Value -ne "ACTIVE" })
  if ($inactives.Count -eq 0) {
    Add-Check "7. Edge Functions" $true "$($slugs.Count) ACTIVE"
    Write-Output "OK - $($slugs.Count) fonctions, toutes ACTIVE"
  } else {
    Add-Check "7. Edge Functions" $false "$($inactives.Count) non ACTIVE"
    Write-Output "NON - $($inactives.Count) fonction(s) non ACTIVE"
  }
}

# --- 8. Deploiement Vercel en production -----------------------------------
Section "8. Deploiement Vercel (production)"
$prod = "https://qlf-gym.vercel.app"
try {
  $sw = Invoke-WebRequest -Uri "$prod/sw.js" -UseBasicParsing -TimeoutSec 30
  $entries = ([regex]::Matches($sw.Content, 'url:')).Count
  $ver = (Invoke-WebRequest -Uri "$prod/version.json" -UseBasicParsing -TimeoutSec 30).Content | ConvertFrom-Json
  Write-Output "$prod : sw.js = $entries entrees de precache"
  Write-Output "build $($ver.build) ($($ver.buildId)) - $($ver.buildDate)"
  if ($entries -le 13) {
    Add-Check "8. Vercel prod" $true "precache $entries, build $($ver.build)"
    Write-Output "OK - build courant servi (precache $entries entrees)"
  } else {
    Add-Check "8. Vercel prod" $false "precache $entries"
    Write-Output "NON - $entries entrees de precache : build perime servi (attendu <= 13)"
  }
} catch {
  Add-Check "8. Vercel prod" $false "injoignable"
  Write-Output "NON - $prod injoignable : $($_.Exception.Message)"
}

# --- Verdict ----------------------------------------------------------------
Write-Output ""
Write-Output "================ RECAPITULATIF ================"
$results | ForEach-Object {
  $etat = if ($_.Ok) { "OK  " } else { "NON " }
  Write-Output "$etat $($_.Poste) : $($_.Detail)"
}
$ko = @($results | Where-Object { -not $_.Ok }).Count
Write-Output "==============================================="
if ($ko -eq 0) {
  Write-Output "VERDICT GLOBAL : OK"
  exit 0
} else {
  Write-Output "VERDICT GLOBAL : NON ($ko poste(s) en echec)"
  exit 1
}
