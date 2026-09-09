# Localship Getting Started Guide

This guide takes a new user from an empty machine to a locally deployed website, a temporary public preview, and—optionally—a custom domain.

Last verified: 2026-09-09

## 1. Understand what Localship does

Localship runs on your computer. It clones a GitHub repository, builds a Docker image, starts the website in an isolated container, and routes requests to the active deployment.

There are three kinds of addresses:

| Address | Where it works | Lifetime |
| --- | --- | --- |
| `project.localhost:4321` | This computer only | Stable while Localship uses the same port |
| `*.trycloudflare.com` | Any device with internet access | Temporary; changes when the tunnel restarts |
| Your custom domain | Any device with internet access | Stable while its named tunnel and this computer are running |

Localship is local-first, so the computer, Docker, Localship, and any public tunnel must stay running for the website to remain available.

## 2. Install the prerequisites

Install:

- Node.js 22 or newer
- Git
- Docker Desktop on Windows or macOS, or Docker Engine on Linux
- `cloudflared` only if you want public previews or custom domains

Verify the first three tools:

```powershell
node --version
npm --version
git --version
docker version
```

Expected result: each command prints version information, and `docker version` shows both a client and a server. If the Docker server is missing, start Docker Desktop and retry.

## 3. Get the Localship repository

Clone and enter the repository:

```powershell
git clone https://github.com/YoussefMohamed108/T1.git localship
Set-Location localship
```

If you already have this repository, open a terminal in its root directory instead.

Localship currently has no third-party Node packages, so there is no dependency-installation step. Run the checks directly:

```powershell
npm test
npm run check
```

Expected result: all tests pass and the syntax check exits without an error.

## 4. Start Localship

Start the server:

```powershell
npm start
```

Expected output:

```text
Localship is running at http://127.0.0.1:4321
```

Keep this terminal open. Visit <http://127.0.0.1:4321> and confirm the header says **Local engine online**.

You can also check the service from another terminal:

```powershell
Invoke-RestMethod http://127.0.0.1:4321/api/health
```

Expected result:

```text
status
------
ok
```

On macOS or Linux, use:

```bash
curl -fsS http://127.0.0.1:4321/api/health
```

## 5. Optional server configuration

The default settings are:

| Variable | Default | Purpose |
| --- | --- | --- |
| `PORT` | `4321` | Dashboard and hostname-router port |
| `HOST` | `127.0.0.1` | Address Localship listens on |
| `DATA_DIR` | `.localship` | Repositories, state, build files, binaries, and persistent volumes |
| `CLOUDFLARED_PATH` | Auto-detected | Optional path to the `cloudflared` executable |

Set variables before starting Localship. PowerShell example:

```powershell
$env:PORT = "4321"
$env:HOST = "127.0.0.1"
$env:DATA_DIR = ".localship"
npm start
```

macOS or Linux example:

```bash
PORT=4321 HOST=127.0.0.1 DATA_DIR=.localship npm start
```

`.env.example` documents the values but is not loaded automatically.

Keep `HOST=127.0.0.1` unless you intentionally want the admin dashboard reachable from your local network. Binding to `0.0.0.0` exposes the dashboard and its project secrets to other devices on that network; Localship does not yet have dashboard authentication.

## 6. Prepare a website repository

The repository must be hosted on GitHub and use either:

- An HTTPS URL such as `https://github.com/owner/project.git`
- An SSH URL such as `git@github.com:owner/project.git`

Private SSH repositories require working Git credentials on the Localship computer.

The repository must contain one of these build configurations:

1. A `Dockerfile`; or
2. A Flask application with both `app.py` and `requirements.txt`, where `requirements.txt` includes Flask.

The application must:

- Listen on `0.0.0.0` inside its container, not `127.0.0.1`.
- Listen on the container port entered in Localship.
- Return an HTTP status below 500 within 10 seconds after startup.
- Write persistent databases and uploads to `/data` if Localship persistent storage is enabled.

Example Node server binding:

```js
server.listen(process.env.PORT || 3000, '0.0.0.0');
```

Example Flask command:

```text
gunicorn --bind 0.0.0.0:3000 app:app
```

## 7. Add the first project

1. Open <http://127.0.0.1:4321>.
2. Select **Add a project**.
3. Enter a clear project name.
4. Paste the GitHub repository URL.
5. Enter the branch, normally `main`.
6. Enter the port used by the application inside its container.
7. Select **Create project**.

The container port is not port 4321. For example, if the website runs on port 3000 inside Docker, enter `3000`.

Expected result: a project card appears with a local address such as `my-project.localhost:4321` and status **not deployed**.

## 8. Configure CPU, memory, processes, storage, and GPU

Select **Manage** in the project card's **Container resources** section.

Choose a profile:

| Profile | CPU | Memory | Persistent storage | Processes | Suggested use |
| --- | ---: | ---: | ---: | ---: | --- |
| Light | 0.5 | 256 MB | 1 GB | 128 | Static sites and small APIs |
| Standard | 1 | 512 MB | 5 GB | 256 | Most websites |
| Heavy | 2 | 2 GB | 20 GB | 512 | Busier or compute-heavy backends |

Custom limits support 0.25–16 CPUs, 128–32768 MB of memory, 0–1024 GB of storage, and 32–4096 processes.

Persistent storage behavior:

- Localship mounts `.localship/volumes/PROJECT_ID` at `/data` inside the container.
- The container receives `LOCALSHIP_DATA_DIR=/data`.
- Files under `/data` survive redeployments.
- Setting storage to `0` disables the mount but does not delete existing files.
- The dashboard shows used storage versus the configured budget.
- The storage value is a monitored budget, not a cross-platform hard runtime quota.
- A new deployment is blocked if existing data is already above its budget.

After changing resources, select **Deploy** again to apply them.

GPU access is off by default. To use it:

1. Install current NVIDIA drivers and configure Docker GPU support/NVIDIA Container Toolkit.
2. Open **Manage** for the project.
3. Turn on **Use host GPU**.
4. Save and deploy again.

Localship passes all Docker-supported host GPUs into that container with `--gpus all`. Leave the switch off for websites that do not need GPU compute. If Docker is not configured for GPUs, the deployment fails and the exact Docker error appears under **Build logs**.

## 9. Deploy the website

1. Select **Deploy** on the project card.
2. Wait while Localship clones or fetches the repository.
3. Localship builds the Docker image and starts a restricted container.
4. Expand **Build logs** to follow progress or diagnose a failure.

Expected result: the status changes from **building** to **ready**, and the local hostname opens the website.

The first build may take several minutes because Docker may need to download base images. Later builds are usually faster because Docker caches layers.

The project card begins recording traffic after the website is reached through its Localship hostname or connected domain. **Traffic analytics** shows total requests, requests during the last 24 hours, HTTP error rate, and response data served. Visits to the Localship dashboard itself are not counted.

### Pause, resume, terminate, or delete a project

Each project card provides lifecycle controls:

| Action | Container | Project settings | Persistent `/data` |
| --- | --- | --- | --- |
| Pause | Stopped but preserved | Preserved | Preserved |
| Resume | Starts the paused container | Preserved | Preserved |
| Terminate | Removed | Preserved | Preserved |
| Delete project | Removed | Deleted | Preserved by default |

Pausing also stops its temporary public preview. Resume the project and select **Publish preview** again when public access is needed.

Use **Terminate** when you want to release runtime resources but may deploy the project again. The website becomes unavailable until its next deployment.

Use **Delete project** to remove it from Localship. Type the exact project name in the confirmation dialog. Leave **Also permanently delete persistent website data** unchecked to retain `.localship/volumes/PROJECT_ID` as a local backup; selecting it permanently removes those files.

## 10. Publish a temporary public preview

This step is optional. The local hostname already works on the Localship computer.

Install `cloudflared` using the official Cloudflare package for your operating system, then make it available in one of these ways:

- Add `cloudflared` to the system `PATH`.
- Set `CLOUDFLARED_PATH` to its absolute path before starting Localship.
- Place it at `.localship/bin/cloudflared.exe` on Windows or `.localship/bin/cloudflared` on macOS/Linux.

Restart Localship after installing it, then:

1. Deploy the project successfully.
2. Select **Publish preview**.
3. Wait for the project card to display a `trycloudflare.com` URL.
4. Open that URL from another device to verify external access.

The preview is free and uses HTTPS, but its URL changes whenever the tunnel restarts. Select **Stop sharing** when it is no longer needed.

## 11. Connect a custom domain

A custom domain is optional and must be purchased from a registrar separately.

1. Select **Custom domain** on the project card.
2. Choose **I own a domain**.
3. Enter only the hostname, such as `app.example.com`.
4. Add the displayed TXT record at the DNS provider managing the domain.
5. Wait for DNS propagation.
6. Select **Verify DNS record**.
7. Add the domain to a Cloudflare account and follow Cloudflare's nameserver instructions.
8. Install `cloudflared` and run the generated named-tunnel commands.
9. Save the generated `localship-cloudflared.yml`, replace its tunnel ID and credentials-file placeholders, and run the displayed tunnel command.

Verification proves control of the domain. The named tunnel is the separate component that sends public traffic to Localship. Keep Localship, the website container, and the named tunnel running.

## 12. Configure a GitHub push webhook

Localship can verify signed GitHub push webhooks and redeploy when the pushed branch matches the configured branch.

Retrieve the project ID and generated secret from the local state endpoint:

```powershell
$state = Invoke-RestMethod http://127.0.0.1:4321/api/state
$state.projects | Select-Object id,name,branch,webhookSecret
```

In the GitHub repository:

1. Open **Settings → Webhooks → Add webhook**.
2. Set the payload URL to `http://REACHABLE-LOCALSHIP-HOST:4321/api/webhooks/github/PROJECT_ID`.
3. Choose content type `application/json`.
4. Paste the project's `webhookSecret`.
5. Select the push event.

Important: GitHub cannot send a webhook to `127.0.0.1` or a normal private LAN address. Localship does not yet create a dedicated public admin webhook endpoint, and its project Quick Tunnel points directly to the website container. Use manual deployment unless you have intentionally provided a secure route to the Localship admin server.

## 13. Stop and restart Localship

To stop Localship cleanly, focus its terminal and press `Ctrl+C`. This closes active Quick Tunnels. Website containers remain managed by Docker with `unless-stopped` restart behavior.

Start Localship again with:

```powershell
npm start
```

The project list, deployment history, resource settings, and persistent storage remain under `.localship`.

Quick Tunnel URLs do not survive the restart. Select **Publish preview** again to receive a new one.

## 14. Back up Localship data

Localship does not yet include a one-click backup command. Back up `.localship` before operating-system changes, disk maintenance, or moving the installation.

For consistent database backups, stop writes to the website first. Copying a live SQLite or similar database may produce an inconsistent backup.

Important paths:

| Path | Contents |
| --- | --- |
| `.localship/state.json` | Projects, deployments, domains, and generated webhook secrets |
| `.localship/volumes/PROJECT_ID` | Persistent website data mounted at `/data` |
| `.localship/repos/PROJECT_ID` | Checked-out Git repositories |
| `.localship/build-recipes` | Generated Dockerfiles |
| `.localship/bin` | Optional bundled helper executables |

Treat `.localship/state.json` as sensitive because it contains webhook secrets.

## 15. Troubleshooting

### Opening `public/index.html` looks broken

Do not use `public/index.html` as the application address. It is the dashboard interface and needs Localship's Node.js backend for project data, deployments, and analytics. Run `npm start`, keep that terminal open, and visit <http://127.0.0.1:4321>. If someone opens the HTML file directly, it now displays these startup instructions instead of an incomplete dashboard.

### Localship says port 4321 is already in use

Only one process can listen on the same address and port. First open <http://127.0.0.1:4321>; Localship may already be running in another terminal. Otherwise identify the process on Windows:

```powershell
Get-NetTCPConnection -LocalPort 4321 -State Listen
```

Stop the existing process only if you recognize it, or use another port for this instance:

```powershell
$env:PORT = "4322"
npm start
```

Localship now prints these options directly instead of an unhandled Node.js stack trace.

### GitHub cloning fails

Test HTTPS connectivity on Windows:

```powershell
Test-NetConnection github.com -Port 443
git ls-remote https://github.com/OWNER/REPOSITORY.git
```

If port 443 fails, check the firewall, proxy, VPN, DNS, or internet connection. For a private repository, verify credentials by cloning it manually in a temporary directory.

### Docker is unavailable

Run:

```powershell
docker info
```

Start Docker Desktop if the daemon is unavailable. On Windows, ensure Docker Desktop is using Linux containers.

### No supported build configuration

Add a valid `Dockerfile`, or use the supported Flask layout with `app.py` and `requirements.txt`. Other frameworks currently require a Dockerfile.

### The container never becomes healthy

Check **Build logs** and confirm:

- The process stays running.
- It listens on `0.0.0.0`.
- Its port matches the Localship container-port setting.
- Its root path returns a status below 500 within 10 seconds.

### The local hostname does not open

Use the exact address shown on the project card, including `:4321`. Test the admin health endpoint first. If Localship uses a different `PORT`, the project URL uses that port too.

### Public preview fails

Verify `cloudflared`:

```powershell
cloudflared --version
```

If it is installed elsewhere, set `CLOUDFLARED_PATH` to the executable before starting Localship. Confirm outbound HTTPS traffic is allowed. Localship forces HTTP/2 for environments where outbound QUIC is blocked.

### DNS verification fails

Confirm the TXT name and value match exactly. DNS changes can take several minutes or longer depending on the provider and previous TTL. Leave the domain pending and retry later.

### Persistent files disappear

Confirm the application writes to `/data`, not its source directory or another container path. Resource settings apply only after a new deployment. The project card shows **Redeploy to apply these changes** when necessary.

### Storage is over budget

Increase the storage budget or safely remove unneeded data from `.localship/volumes/PROJECT_ID`, then deploy again. Make a backup before deleting persistent files.

### A GPU deployment fails

Turn **Use host GPU** off unless the site needs GPU compute. If it does, verify Docker GPU access independently before redeploying:

```powershell
docker run --rm --gpus all nvidia/cuda:13.0.0-base-ubuntu24.04 nvidia-smi
```

Use a CUDA image tag supported by your installed drivers if that example is unavailable.

## 16. Current limitations

- The dashboard has no user authentication; keep it bound to localhost.
- Quick Tunnel URLs are temporary and held in memory.
- The computer must remain online for public websites.
- Only Dockerfiles and detected Flask projects build automatically.
- Resource storage is monitored rather than hard-capped during runtime.
- One-click backups, restores, secrets management, and rollback are not implemented yet.
- Automatic GitHub App installation and a hosted control plane are future work.

## 17. Safe update procedure

Before updating Localship:

1. Back up `.localship/state.json` and `.localship/volumes`.
2. Stop Localship with `Ctrl+C`.
3. Pull the repository changes.
4. Run the tests and syntax check.
5. Start Localship and verify `/api/health`.
6. Open each important local deployment.
7. Republish any temporary public previews.

```powershell
git pull --ff-only
npm test
npm run check
npm start
```

Expected result: tests pass, Localship reports its local URL, and the health endpoint returns `ok`.

Localship has no automatic rollback command yet. If an update breaks the service, restore the backed-up data, return the repository to a known-good revision using your normal Git workflow, and run the verification steps again.
