# Localship

Localship is a local-first deployment platform: connect a GitHub repository, build its Dockerfile, and run the deployment on your own machine behind a simple dashboard and hostname router.

## Start here

New users should follow the complete [Getting Started Guide](docs/GETTING_STARTED.md). It covers installation, the first deployment, resource and storage configuration, public previews, custom domains, webhooks, daily operation, and troubleshooting.

For an already configured development machine:

```powershell
npm test
npm start
```

Then open <http://127.0.0.1:4321>.

## Current milestone

- Register GitHub repositories and branches.
- Build repository Dockerfiles with Docker or automatically detect Flask applications.
- Start isolated, resource-limited containers.
- Health-check and atomically promote deployments.
- Keep deployment history and build logs.
- Trigger deployments manually or through signed GitHub push webhooks.
- Register hostname mappings and generate custom-domain DNS instructions.
- Proxy active custom hostnames to the current local deployment.
- Give every project an automatic `project.localhost` development URL.
- Generate Cloudflare Tunnel and manual reverse-proxy instructions for user-owned domains.
- Publish temporary public HTTPS previews through Cloudflare Quick Tunnels.
- Configure per-project CPU, memory, process, storage, and optional GPU access.
- See per-project request totals, 24-hour traffic, error rate, and data served.
- Pause and resume containers, terminate runtimes, or safely delete projects from the dashboard.

GitHub App installation, managed secrets, and hosted control-plane features remain future work.

## Requirements

- Node.js 22 or newer
- Git
- Docker Engine or Docker Desktop

## Run

Open the dashboard and add a repository containing a `Dockerfile`, or a Flask project with `app.py` and `requirements.txt`. See the Getting Started Guide for the complete workflow and expected results.

Localship writes runtime data, checked-out repositories, and build logs to `.localship/`, which is ignored by Git.

## Website resources

Every project card shows its configured container limits. Choose **Manage** to select a suggested profile or enter custom values:

- **Light:** 0.5 CPU, 256 MB memory, 1 GB storage, 128 processes—for static sites and small APIs.
- **Standard:** 1 CPU, 512 MB memory, 5 GB storage, 256 processes—the default for most websites.
- **Heavy:** 2 CPUs, 2 GB memory, 20 GB storage, 512 processes—for busier backends or compute-heavy work.

Custom limits accept 0.25–16 CPUs, 128–32768 MB of memory, 0–1024 GB of persistent storage, and 32–4096 processes. Saved changes apply to the next deployment, and each deployment records the limits it actually used.

GPU access is opt-in. Turn on **Use host GPU** under **Manage** only when Docker is configured for GPU containers. Localship passes `--gpus all` to the container; NVIDIA drivers and NVIDIA Container Toolkit/Docker GPU support must already be installed on the host.

When storage is enabled, Localship mounts `.localship/volumes/PROJECT_ID` into the container at `/data` and provides `LOCALSHIP_DATA_DIR=/data`. Databases and uploads must be configured to use that directory. Localship measures its usage and preserves it when containers are replaced. Because portable Docker bind mounts cannot enforce a reliable cross-platform quota, the configured amount is a monitored budget: Localship blocks a new deployment if existing data is already over budget, but it cannot stop a running application from exceeding it. Back up important data separately.

Each project card includes local traffic analytics. Requests are counted at Localship's proxy, including total requests, requests during the last 24 hours, HTTP error rate, and response bytes served. Dashboard API traffic is excluded.

## Project lifecycle controls

- **Pause** stops the current container and public preview but keeps the container ready to resume.
- **Resume** starts the same paused container again.
- **Terminate** removes the running container while keeping the project settings and persistent `/data`; deploy again to create a new runtime.
- **Delete project** removes the project, domains, analytics, containers, checkout, and generated build recipe. Persistent `/data` is kept as a local backup unless the user explicitly selects permanent data deletion and types the project name to confirm.

## GitHub webhook

After creating a project, fetch `GET /api/state` to see its generated `webhookSecret`. Configure the repository webhook as:

- URL: `http://YOUR-REACHABLE-HOST:4321/api/webhooks/github/PROJECT_ID`
- Content type: `application/json`
- Secret: the generated `webhookSecret`
- Event: push

For internet-delivered GitHub webhooks, the next milestone will connect the local agent to a hosted control plane through an outbound tunnel.

## Custom domains

Every project automatically receives a local URL such as:

```text
http://my-project.localhost:4321
```

You do not need to own a domain. **Publish preview** creates a free temporary public URL and is enough for testing or sharing.

When you own a domain, choose **Custom domain** on the project card:

1. Enter a hostname such as `app.example.com`.
2. Add the generated `_localship.app.example.com` TXT record at the DNS provider that manages the domain.
3. Select **Verify DNS record**. The hostname remains pending until Localship finds the exact token.
4. Add the domain to Cloudflare, follow Cloudflare's nameserver instructions, and run the generated named-tunnel commands and configuration.

DNS verification proves control of the hostname; the named tunnel is what makes it reachable from the internet. The computer, Localship, and `cloudflared` must remain running. A manual reverse proxy can be used instead, but it must preserve the original `Host` header.

## Public previews

Deploy a project, then choose **Publish preview**. Localship starts a free Cloudflare Quick Tunnel directly to the ready container and displays the generated public HTTPS URL. The URL works from other devices but changes when the tunnel restarts and is intended for testing or demonstrations. If no bundled `cloudflared` executable is available, the dashboard links to the official installer.
