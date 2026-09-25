# ConnectWise Manage (PSA) MCP — Suffolk deployment

Suffolk's fork of [WYRE-AI/connectwise-manage-mcp](https://github.com/WYRE-AI/connectwise-manage-mcp), branch `suffolk` (based on upstream `v1.9.0`). It sits behind the Cloudflare **SCC MCP** portal next to the UniFi and UISP MCP servers, and is set up the same way.

## What the fork changes

| Change | Why |
|---|---|
| `MCP_BEARER_TOKEN` is required on `/mcp` whenever it's set (`src/index.ts`) | Upstream only checks it in Entra OAuth mode, so `/mcp` was open by default. Now it works like `MCP_AUTH_TOKEN` on UniFi/UISP. |
| Read-only by default (`src/mcp-server.ts`) | The 14 create/update/delete/add-note tools aren't registered unless `CW_ENABLE_WRITE_TOOLS=true`. The other 39 tools are marked `readOnlyHint`. |
| `install-service.ps1`, `.env.suffolk.example` | Same installer flow as UniFi/UISP (WinSW service, locked-down `.env`, connection check). |
| `vitest.config.ts` | Tests run with write tools on, so all upstream tests still pass. |

The API member's ConnectWise security role is still the real control. Keep it at Inquire only.

## Setup (Windows Server)

1. **Create the ConnectWise API member.** Set up a security role `API - MCP Read Only` with Inquire = All and Add/Edit/Delete = None. Then create the API member `mcp-readonly` (Level: Corporate) with that role, and generate its public/private keys. Get a Client ID from [developer.connectwise.com](https://developer.connectwise.com/).
2. **Install Node.js LTS for all users** (`winget install OpenJS.NodeJS.LTS`), then open a new PowerShell. The service runs as SYSTEM.
3. **Clone the fork** to `C:\Services\cwpsa-mcp`:
   ```powershell
   git clone -b suffolk https://github.com/<suffolk-account>/connectwise-manage-mcp.git C:\Services\cwpsa-mcp
   ```
4. **Run the installer** from an elevated PowerShell:
   ```powershell
   cd C:\Services\cwpsa-mcp
   Set-ExecutionPolicy -Scope Process Bypass
   .\install-service.ps1
   ```
   - **First run:** it builds the server and creates `.env` with a random `MCP_BEARER_TOKEN`. It then opens `.env` in Notepad so you can fill in the four `CW_MANAGE_*` values.
   - **Second run:** it tests ConnectWise (`cw_test_connection` on a temporary local port), then installs the **SCC-CWPSAClaudeMCP** service on port **8767** (Automatic, delayed start, LocalSystem, restarts on failure). It confirms the endpoint rejects requests without the token.
5. **Firewall:** if cloudflared runs on another machine, let it reach TCP 8767: `.\install-service.ps1 -OpenFirewall -RemoteAddress <cloudflared-IP>`.

### Day-to-day

```powershell
Restart-Service SCC-CWPSAClaudeMCP                                          # after editing .env
Get-Content C:\Services\cwpsa-mcp\logs\SCC-CWPSAClaudeMCP.err.log -Tail 50 -Wait   # server log (stderr)
.\install-service.ps1 -Uninstall
```

## Cloudflare (same tunnel and portal as UniFi/UISP)

1. **Tunnel → Public Hostname:** `cwpsa-mcp.suffolkit.com` → HTTP → `192.168.97.8:8767`. Use `localhost:8767` if cloudflared runs on this server.
2. **Access:** protect the hostname the same way as `uisp-mcp.suffolkit.com`, with the **SCC-ServiceTokens** service-token policy.
3. **Test it**, going through Cloudflare DNS so internal DNS doesn't interfere. `401` means everything works:
   ```powershell
   curl.exe -s -o NUL -w "%{http_code}`n" --doh-url https://1.1.1.1/dns-query -X POST https://cwpsa-mcp.suffolkit.com/mcp -H "CF-Access-Client-Id: <id>" -H "CF-Access-Client-Secret: <secret>"
   ```
4. **MCP Portals → MCP servers → Add:**
   - Name `ConnectWise PSA`, server ID `cwpsa-mcp`, URL `https://cwpsa-mcp.suffolkit.com/mcp`
   - Custom headers: `Authorization: Bearer <MCP_BEARER_TOKEN>`, plus `CF-Access-Client-Id` and `CF-Access-Client-Secret`
   - Policies: **SCC-ServiceTokens** and **SCC-MCP-StaffAllow**
5. **Server portals → SCC MCP → Select existing servers:** add `cwpsa-mcp` with **User auth required** off.

Claude picks up the new tools through the existing connector. Reconnect it if they don't appear.

## Updating from upstream

```powershell
cd C:\Services\cwpsa-mcp
git remote add upstream https://github.com/WYRE-AI/connectwise-manage-mcp.git   # first time only
git fetch upstream --tags
git merge <new tag>          # resolve conflicts in src/index.ts / src/mcp-server.ts if any
git push
.\install-service.ps1         # stops the service, rebuilds, reinstalls
```

New upstream write tools stay hidden automatically if their names start with `cw_create_`, `cw_update_`, `cw_delete_` or `cw_add_`. Check that new tool names follow that pattern.

## Turning on writes later

1. Widen the API member's role for just what's needed, for example Service Tickets and Time Entry.
2. Set `CW_ENABLE_WRITE_TOOLS=true` in `.env` and run `Restart-Service SCC-CWPSAClaudeMCP`.
3. In the portal's tool list, turn off the write tools you don't want.

Ticket notes can email the contact (`emailContactFlag`), so test on an internal ticket first.
