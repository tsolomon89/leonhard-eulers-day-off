# Local Dev Shutdown Runbook (Port-Scoped Safe)

This runbook only stops listeners on known dev ports and does not kill unrelated `node`/`python` processes.

## 1. Preview listeners (safe dry run)

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\stop-dev-servers.ps1 -DryRun
```

## 2. Stop only known dev ports

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\stop-dev-servers.ps1
```

Default ports: `5173`, `8080`, `3000`.

## 3. Verify no listeners remain

```powershell
Get-NetTCPConnection -State Listen |
  Where-Object { $_.LocalPort -in 5173,8080,3000 } |
  Select-Object LocalPort, OwningProcess
```

Expected: no rows returned.

## 4. Restart local server

```powershell
npx serve -l 8080 tau-euler-atlas
```

Alternative:

```powershell
python -m http.server 8080 --directory tau-euler-atlas
```

Open `http://localhost:8080/`.
