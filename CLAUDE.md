# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 🎯 Recent Changes: Holo 1.5-7B Integration & SOM Visual Grounding

**OpenCV and OmniParser have been removed** to reduce complexity and improve maintainability. The system now relies on:
- **Holo 1.5-7B** (PRIMARY) - Qwen2.5-VL-based UI element localization (cross-platform: Windows/Linux/macOS)
- **Set-of-Mark (SOM)** - Numbered visual grounding for improved click accuracy (70-85% vs 20-30% with raw IDs)
- **Tesseract.js** (FALLBACK) - Pure JavaScript OCR for text extraction

**What was removed:**
- All OpenCV native bindings and build complexity
- Template matching, feature detection, contour detection services
- OpenCV preprocessing pipelines (CLAHE, morphology, filters)
- OmniParser v2.0 (replaced with Holo 1.5-7B)

**What was added:**
- ✅ **SOM Visual Grounding**: Automatic numbered element annotations [0], [1], [2] on screenshots
- ✅ **Vision/Non-Vision Support**: Red boxes for vision models, text lists for non-vision models
- ✅ **Element Number Resolution**: Click elements by visible number instead of cryptic IDs
- ✅ **System Prompt Optimization**: Strong emphasis on SOM as preferred clicking method
- ✅ **CV Activity Indicators**: Real-time Holo metadata display (profile, quantization, task status)

**Benefits:**
- ✅ Simpler installation (no native bindings to compile)
- ✅ Smaller package size (~5.5GB Holo 1.5 GGUF vs multiple GB OmniParser + OpenCV)
- ✅ Better cross-platform compatibility (no C++ compilation issues)
- ✅ Superior detection accuracy (Holo 1.5 cross-platform UI understanding)
- ✅ Improved click accuracy (70-85% with SOM vs 20-30% with raw IDs)

## Important Instruction Reminders

Do what has been asked; nothing more, nothing less.
NEVER create files unless they're absolutely necessary for achieving your goal.
ALWAYS prefer editing an existing file to creating a new one.
NEVER proactively create documentation files (*.md) or README files. Only create documentation files if explicitly requested by the User.

## Architecture Overview

Bytebot Hawkeye is a precision-enhanced fork of the open-source AI Desktop Agent platform. It consists of these main packages:

1. **bytebot-agent** - NestJS service that orchestrates AI tasks, computer use, and precision targeting
2. **bytebot-agent-cc** - Claude Code integration variant with `@anthropic-ai/claude-code` SDK
3. **bytebot-ui** - Next.js frontend with desktop dashboard and task management
4. **bytebotd** - Desktop daemon providing computer control with enhanced coordinate accuracy
5. **bytebot-cv** - Computer vision package with Holo 1.5 client + Tesseract.js for element detection
6. **bytebot-holo** - Python FastAPI service running Holo 1.5-7B (Qwen2.5-VL) for UI element localization
7. **bytebot-llm-proxy** - LiteLLM proxy service for multi-provider model routing
8. **shared** - Common TypeScript types, utilities, and universal coordinate mappings

### Package Dependencies

All packages depend on `shared` and must build it first. The build order is:
1. `shared` (base types and utilities)
2. `bytebot-cv` (CV capabilities)
3. `bytebot-agent`, `bytebot-agent-cc`, `bytebotd` (services that consume shared + cv)
4. `bytebot-ui` (frontend that consumes shared)

## Key Hawkeye Enhancements

This fork adds precision tooling on top of upstream Bytebot:
- **Smart Focus System**: 3-stage coarse→focus→click workflow with tunable grids
- **Progressive zoom capture**: Deterministic zoom ladder with coordinate reconciliation
- **Universal element detection**: Holo 1.5-7B (Qwen2.5-VL) + Tesseract.js OCR
- **Coordinate telemetry**: Accuracy metrics and adaptive calibration
- **Grid overlay guidance**: Always-on coordinate grids with debug overlays

## Quick Start

**Simple 3-step setup:**

```bash
# 1. Install dependencies
npm install

# 2. Build packages (shared → bytebot-cv → services)
cd packages/shared && npm run build
cd ../bytebot-cv && npm install && npm run build

# 3. Setup Holo 1.5-7B (auto-detects Apple Silicon vs x86_64/NVIDIA)
./scripts/setup-holo.sh

# 4. Start stack
./scripts/start-stack.sh
```

### What Happens Automatically

**On Apple Silicon (M1-M4):**
- Sets up native OmniParser with MPS GPU (~1-2s/frame)
- Configures Docker to connect to native service
- Best performance: GPU-accelerated

**On x86_64 + NVIDIA GPU:**
- Uses Docker container with CUDA (~0.6s/frame)
- Auto-detects and uses GPU
- Production-ready setup

**On x86_64 CPU-only:**
- Uses Docker container with CPU (~8-15s/frame)
- Works everywhere, slower performance

### Manual Control

```bash
# Apple Silicon only: Start/stop native Holo 1.5-7B
./scripts/start-holo.sh  # Start with MPS GPU
./scripts/stop-holo.sh   # Stop

# Stop entire stack
./scripts/stop-stack.sh
```

### Tiny11 Container (Optional - **RECOMMENDED**)

Run Bytebot with **Tiny11 2311** (stripped Windows 11) for faster installation and lower resource usage:

```bash
# Start Tiny11 stack with pre-baked image (Windows installer package built automatically)
./scripts/start-stack.sh --os windows --prebaked
```

**System Requirements:**
- KVM support (`/dev/kvm` must be available)
- **Recommended**: 8GB+ RAM, 4+ CPU cores
- **Minimum**: 6GB RAM, 4 cores
- 50GB+ disk space (Tiny11 is much lighter than full Windows 11!)

**Why Tiny11?**
- 🚀 **50% faster download**: ~3.5GB ISO vs ~6GB Windows 11 ISO
- ⚡ **40% less resources**: 6GB RAM vs 8GB, 50GB disk vs 100GB
- 🎯 **Stripped Windows 11**: No bloatware, fully serviceable and updateable
- ✅ **Same compatibility**: Works identically to Windows 11 for bytebotd

**Setup Process:**
1. **Windows installer package built automatically** (~90MB with Windows sharp binaries)
   - Builds packages on Linux host (shared, bytebot-cv, bytebotd)
   - Pre-installs Windows-native sharp binaries (@img/sharp-win32-x64)
   - Installs Windows-specific node_modules (uiohook-napi win32 prebuilds)
   - Creates ZIP package at `docker/windows-installer/bytebotd-prebaked.zip`
   - **Size:** ~90MB (95% smaller than old 1.8GB artifacts)
2. Stack starts Tiny11 container (5-10 minutes for Windows installation)
3. **Automated installation runs (`install-prebaked.ps1` via `/oem` mount):**
   - Downloads and extracts Node.js 20 portable (~2 minutes)
   - Adds Node.js to system PATH (Machine + current process)
   - Extracts installer package to `C:\Program Files\Bytebot\packages\` (~11 minutes)
   - Verifies Windows sharp binaries (pre-installed, no rebuild needed)
   - Creates scheduled task "Bytebotd Desktop Agent" with direct node.exe execution
   - Starts bytebotd service with port conflict prevention
   - Starts tray monitor automatically (green icon in system tray)
4. Access Windows web viewer at `http://localhost:8006` to monitor progress
5. **Total time: 15-20 minutes** on fresh start (mostly Windows boot + ZIP extraction)

**Architecture Note:**
- Small scripts (~8KB) in `/oem` mount → copied to `C:\OEM` by dockur/windows
- **Pre-built Windows installer package** (~90MB) copied from `/oem` during installation
- ZIP contains Windows-native binaries including sharp (@img/sharp-win32-x64)
- Helper scripts (tray monitor, diagnostics) in packages/bytebotd/ directory
- This architecture enables truly fresh start with zero manual intervention

**Port Conflict Protection:**
- fresh-build.sh now uses Docker's port filter (`docker ps --filter "publish=$port"`) instead of `lsof`
- `lsof` only detects listening processes; Docker reserves ports at kernel level before services start
- Final cleanup pass removes orphaned containers (e.g., test-bytebot-windows) before starting new ones
- Prevents "Bind for 0.0.0.0:3389 failed: port is already allocated" errors

**Windows Scheduled Task Fix:**
- install-prebaked.ps1 now wraps batch file execution in `cmd.exe /c` for scheduled tasks
- MSI CustomActions.wxs also updated to use `cmd.exe /c` wrapper
- Windows scheduled tasks require executables (.exe), not batch files (.bat) directly
- Fixes "The system cannot find the file specified" error during service registration

**Performance Benchmarks (Actual Hardware):**

| Hardware | CPU | RAM | Disk | Fresh Build Time | Notes |
|----------|-----|-----|------|------------------|-------|
| **Developer Machine** | Intel i7-4770 (4C/8T, 2013) | 31GB | 70% full | **21+ minutes** | Older CPU, KVM overhead significant |
| **Expected (Modern)** | Intel i7-12700+ or AMD Ryzen 5 5600X+ | 16GB+ | <50% full | **8-15 minutes** | Recommended baseline |

**Performance Factors:**
- **CPU age**: Older CPUs (2010-2015) may take 2-3x longer due to KVM virtualization overhead
- **Disk I/O**: SSDs recommended; HDDs or near-full disks (>70%) significantly slower
- **RAM pressure**: <12GB available RAM may cause swapping, adding 5-10 minutes
- **Network speed**: Initial Windows ISO download (~6GB) depends on connection

**Troubleshooting:**
- **Slow startup**: Normal on slower systems, wait up to 2 minutes for health check
- **Check logs**: `C:\Bytebot-Logs\install-prebaked.log` and `bytebotd-*.log` (view via tray icon)
- **Run diagnostic**: Right-click tray icon → View Logs, or run `C:\Program Files\Bytebot\packages\bytebotd\diagnose.ps1`
- **Tray icon**: Green = healthy, Yellow = starting, Red = stopped, Missing = scripts not copied
- **Resource issues**: Increase RAM/CPUs in `docker/.env` if experiencing slowness
- **Rebuild installer**: `rm -rf docker/windows-installer/bytebotd-prebaked.zip && ./scripts/build-windows-prebaked-package.sh`
- **Sharp module errors**: Pre-installed Windows binaries at `node_modules/@img/sharp-win32-x64/`, no rebuild needed
- **Node.js not in PATH**: Installer auto-adds to system PATH, check `[Environment]::GetEnvironmentVariable("Path", "Machine")`
- **Port conflicts**: Installer stops existing tasks before starting, check `schtasks /query /tn "Bytebotd Desktop Agent"`
- **Time drift**: Container uses `ARGUMENTS=-rtc base=localtime` to sync with host clock
- **Fresh start verification**: Delete volume (`docker volume rm docker_bytebot-windows-storage`) then restart stack

**Recent Windows Fixes (Complete Fresh Start Installation):**

The following issues were fixed to enable truly hands-off fresh start installation:

1. **Tray Monitor Scripts Not Found** (`build-windows-prebaked-package.sh`)
   - **Problem**: Helper scripts copied to wrong directory (`bytebot/` instead of `bytebot/packages/bytebotd/`)
   - **Fix**: Updated script copy paths to match installer expectations
   - **Result**: Tray monitor starts automatically, shows green icon in system tray

2. **PowerShell .Count Property Error** (`install-prebaked.ps1`)
   - **Problem**: `Get-Process` returns single object when 1 process found, `.Count` property doesn't exist
   - **Fix**: Wrapped with `@()` to force array type: `$NodeProcesses = @(Get-Process -Name "node" -ErrorAction SilentlyContinue)`
   - **Result**: No more "The property 'Count' cannot be found" errors

3. **Port Conflict on Fresh Start** (`install-prebaked.ps1`)
   - **Problem**: Scheduled task from previous run holds port 9990, causing EADDRINUSE error
   - **Fix**: Added task cleanup before starting: `Get-ScheduledTask | Stop-ScheduledTask -ErrorAction SilentlyContinue`
   - **Result**: Clean port 9990 binding on every fresh start

4. **Node.js Not in PATH** (`install-prebaked.ps1`)
   - **Problem**: Node.js not available for docker user, scheduled task fails
   - **Fix**: Auto-add to system PATH (Machine + current process environment)
   - **Result**: `node.exe` available globally, scheduled task executes successfully

5. **Sharp Module Windows Binaries** (`build-windows-prebaked-package.sh`)
   - **Problem**: Linux sharp binaries installed, "Could not load sharp module using win32-x64 runtime" error
   - **Fix**: Pre-install `@img/sharp-win32-x64` during package build with `--force` flag
   - **Result**: No rebuild needed, bytebotd starts immediately with correct sharp binaries

**Testing Results:**
- ✅ Fresh installation tested with deleted volume
- ✅ Health check passes on first attempt (http://localhost:9990/health)
- ✅ Scheduled task creates and starts successfully
- ✅ Node.js available in PATH for all users
- ✅ Sharp module loads correctly without rebuild
- ✅ Tray monitor starts automatically
- ✅ Total time: ~15 minutes (mostly Windows boot + ZIP extraction)

**Commit:** `43dc7eb` - "fix(windows): complete fresh start installation with tray monitor"

**BTRFS Filesystem - Native Compatibility:**
- ✅ **Windows containers now work directly on BTRFS** (no workaround needed!)
- **Solution**: dockur/windows provides `DISK_IO=threads` and `DISK_CACHE=writeback` environment variables
- These settings avoid the O_DIRECT requirement that BTRFS doesn't support
- **Performance**: Minimal performance impact, fully functional on BTRFS

**Configuration** (already applied in docker-compose files):
```yaml
environment:
  - DISK_IO=threads
  - DISK_CACHE=writeback
```

**Benefits:**
- ✅ No loop device creation or sudo required
- ✅ Works directly on BTRFS root filesystem
- ✅ Standard Docker volumes (no manual mount points)
- ✅ Simpler setup and maintenance
- ✅ No filesystem corruption risk from loop devices

**Why build on host?**
- Pre-built artifacts mounted as read-only volumes = 2-3 min setup
- Building inside Windows = 10-20 min npm install + compile
- Same artifacts work on Linux and Windows containers

**Windows Installer Package (Automatic):**

The `build-windows-prebaked-package.sh` script creates a portable ZIP package with Windows-native binaries:

1. **Builds packages**: Compiles shared, bytebot-cv, bytebotd on Linux host
2. **Installs Windows dependencies**: Pre-installs sharp (@img/sharp-win32-x64) + other Windows-specific modules
3. **Copies helper scripts**: Tray monitor, diagnostics to packages/bytebotd/ directory
4. **Creates ZIP package**: Packages everything into `bytebotd-prebaked.zip` (~90MB)
5. **Cached on subsequent runs**: Installer regenerated only when missing or script changes

Location: `docker/windows-installer/bytebotd-prebaked.zip` (~90MB)

The script runs automatically during `./scripts/start-stack.sh --os windows --prebaked` but can be run manually:
```bash
./scripts/build-windows-prebaked-package.sh
```

**Benefits over old approach:**
- **95% smaller**: 90MB vs 1.8GB artifacts
- **No rebuilds**: Windows sharp binaries pre-installed
- **Tray monitor included**: Automatic system tray status icon
- **Simpler**: Direct ZIP extraction, no symlink resolution
- **Fresh start ready**: Passes all health checks on first boot

**Ports:**
- `8006` - Web-based VNC viewer
- `3389` - RDP access
- `9990` - Bytebotd API (after setup)
- `9991` - Bytebot Agent
- `9992` - Bytebot UI
- `9989` - Holo 1.5-7B

**Why Windows?**
- Test UI automation on Windows applications
- Holo 1.5-7B trained on Windows UI (same model, cross-platform)
- Resolution matched to Linux container (1280x960)

### Windows 11 Container (Pre-baked Image - **RECOMMENDED**)

For 96% faster startup, use the **pre-baked Windows image** with MSI installer:

```bash
# Start Windows stack with pre-baked image (30-60 second startup!)
./scripts/start-stack.sh --os windows --prebaked
```

**What is a Pre-baked Image?**
- Windows 11 container with Bytebotd **pre-installed via MSI** during image build
- Eliminates runtime installation delays (8-15 minutes → 30-60 seconds)
- Based on `dockur/windows` with baked-in MSI installer

**Benefits:**
- ⚡ **96% faster startup**: 30-60 seconds vs 8-15 minutes
- 🎯 **Deterministic**: MSI tested at build time, not runtime
- 🔒 **Reliable**: Same image = same behavior every time
- 📦 **Self-contained**: No network dependency for installer transfer

**System Requirements:**
- Same as runtime installation approach (KVM, 8GB+ RAM, 150GB disk)
- WiX Toolset v3.11+ (Windows only, for MSI build)
- PowerShell (for MSI build script)

**Setup Process:**

1. **Build MSI installer** (one-time, on Windows machine):
   ```powershell
   # On Windows (requires WiX Toolset)
   .\scripts\build-msi.ps1
   ```

   This creates `docker/windows-installer/bytebotd-installer.msi` (~80MB)

2. **Build pre-baked Docker image** (30-40 minutes, one-time):
   ```bash
   # On Linux host
   ./scripts/build-windows-prebaked-image.sh
   ```

   This creates `bytebot-windows-prebaked:latest` Docker image

3. **Start container** (30-60 seconds):
   ```bash
   ./scripts/start-stack.sh --os windows --prebaked
   ```

**Architecture:**

```
┌─────────────────────────────────────────────┐
│  Pre-baked Docker Image Build Process      │
├─────────────────────────────────────────────┤
│                                             │
│  1. Build MSI (Windows)                     │
│     └─> bytebotd-installer.msi (~80MB)     │
│                                             │
│  2. Build Docker Image (Linux)              │
│     FROM dockurr/windows:11                 │
│     COPY bytebotd-installer.msi /oem/       │
│     ENV CUSTOM=/oem/install-msi-silent.cmd  │
│     └─> bytebot-windows-prebaked:latest     │
│                                             │
│  3. Runtime (instant startup)               │
│     - Windows boots (~20 seconds)           │
│     - MSI installs silently (~10-40 seconds)│
│     - Service starts automatically          │
│     - Total: 30-60 seconds                  │
└─────────────────────────────────────────────┘
```

**Files Created:**

- `scripts/wix/Product.wxs` - MSI installer definition
- `scripts/wix/Components.wxs` - File components
- `scripts/wix/CustomActions.wxs` - Sharp rebuild, service registration
- `scripts/build-msi.ps1` - PowerShell MSI build script
- `docker/Dockerfile.windows-prebaked` - Pre-baked image definition
- `docker/oem/install-msi-silent.cmd` - Silent MSI installation script
- `docker/docker-compose.windows-prebaked.yml` - Docker Compose for pre-baked image
- `scripts/build-windows-prebaked-image.sh` - Orchestration script

**MSI Installer Features:**

- **Automatic Sharp rebuild**: MSI custom action rebuilds Sharp for Windows binaries
- **Windows Service registration**: Creates scheduled task "Bytebotd Desktop Agent"
- **Auto-start**: Service starts automatically on installation and boot
- **Health monitoring**: File-based heartbeat + HTTP health checks
- **Tray icon**: PowerShell tray monitor starts automatically
- **Logging**: All logs in `C:\Bytebot-Logs\`

**Comparison:**

| Feature | Runtime Installation | Pre-baked Image |
|---------|---------------------|-----------------|
| **Startup time** | 8-15 minutes | 30-60 seconds ⚡ |
| **Build time** | N/A | 30-40 min (one-time) |
| **Reliability** | Medium (network dependency) | High (deterministic) |
| **Debugging** | Runtime logs | Build-time errors |
| **Network dependency** | Yes (Samba share) | No |
| **Image size** | 15GB | 15.1GB (+0.5%) |
| **Determinism** | Low (install can fail) | High (tested at build) |

**Troubleshooting:**

- **MSI build fails**: Ensure WiX Toolset v3.11+ installed on Windows
- **PowerShell not found**: Install PowerShell Core or build MSI on Windows
- **Image build fails**: Check MSI exists at `docker/windows-installer/bytebotd-installer.msi`
- **Service won't start**: Check logs at `C:\Bytebot-Logs\msi-install.log`
- **Sharp errors**: MSI custom action rebuilds Sharp automatically; check `C:\Bytebot-Logs\sharp-rebuild.log`

**WiX Toolset Installation:**

Download from: https://wixtoolset.org/releases/
Install WiX Toolset v3.11 or later on Windows machine

**When to Use:**

- ✅ **Production deployments**: Fast, reliable startup
- ✅ **Development**: Quick iteration cycles
- ✅ **CI/CD**: Pre-built images for testing
- ✅ **Demos**: Instant startup for presentations
- ❌ **First-time setup**: Requires MSI build infrastructure

**Fallback to Runtime Installation:**

If pre-baked image fails, use runtime installation:
```bash
./scripts/start-stack.sh --os windows
```

### macOS Container (Optional)

Run Bytebot with a macOS Sonoma/Sequoia desktop environment:

```bash
# Start macOS stack
./scripts/start-stack.sh --os macos
```

**Requirements:**
- **Apple Hardware Only** (iMac, Mac mini, MacBook, Mac Studio, Mac Pro)
- KVM support (`/dev/kvm` must be available)
- 8GB+ RAM recommended
- 64GB+ disk space

**Setup Process:**
1. Stack starts macOS container (may take 5-10 minutes for first boot)
2. Access macOS web viewer at `http://localhost:8006` or VNC at `vnc://localhost:5900`
3. Open Terminal inside macOS and run setup script as root:
   ```bash
   cd /shared
   sudo bash ./setup-macos-bytebotd.sh
   ```
4. Bytebotd will auto-start via LaunchAgent on subsequent boots

**Ports:**
- `8006` - Web-based viewer
- `5900` - VNC access
- `9990` - Bytebotd API (after setup)
- `9991` - Bytebot Agent
- `9992` - Bytebot UI
- `9989` - Holo 1.5-7B

**Why macOS?**
- Test UI automation on macOS applications
- Holo 1.5-7B trained on macOS UI (same model, cross-platform)
- Resolution matched to Linux/Windows containers (1280x960)
- **Licensing:** macOS EULA requires Apple hardware

## Development Commands

### Build Dependencies
The shared package must be built first as other packages depend on it:
```bash
cd packages/shared && npm run build
```

### bytebot-agent (NestJS API service)
```bash
cd packages/bytebot-agent

# Development
npm run start:dev          # Watch mode with shared build
npm run prisma:dev         # Run migrations + generate client

# Testing
npm run test               # Jest unit tests
npm run test:watch         # Jest watch mode
npm run test:e2e           # End-to-end tests
npm run test -- <file>     # Run single test file

# Production
npm run build              # Build with shared dependencies
npm run start:prod         # Production server
npm run lint               # ESLint with --fix
```

### bytebot-agent-cc (Claude Code Integration)
```bash
cd packages/bytebot-agent-cc

# Same commands as bytebot-agent
# Includes @anthropic-ai/claude-code SDK integration
npm run start:dev          # Watch mode
npm run prisma:dev         # Migrations
npm run test               # Jest tests
npm run build              # Build
```

### bytebot-ui (Next.js frontend)
```bash
cd packages/bytebot-ui

npm run dev                # Development server
npm run build              # Production build
npm run start              # Production server
npm run lint               # Next.js linting
npm run test               # Native Node.js tests
```

### bytebotd (Desktop daemon)
```bash
cd packages/bytebotd

npm run start:dev          # Watch mode with shared build
npm run build              # Nest build
npm run start:prod         # Production server
npm run test               # Jest tests
npm run lint               # ESLint with --fix
```

### bytebot-cv (Computer vision)
```bash
cd packages/bytebot-cv

npm install                # Install dependencies (Tesseract.js, canvas)
npm run build              # TypeScript compilation
npm run dev                # Watch mode

# Note: OpenCV removed - now uses OmniParser + Tesseract.js only
```

### bytebot-llm-proxy (LiteLLM Proxy)
```bash
cd packages/bytebot-llm-proxy

# Configuration in litellm-config.yaml
# Provides unified API routing for OpenAI, Anthropic, Gemini, OpenRouter, LMStudio
# Environment variables: OPENAI_API_KEY, ANTHROPIC_API_KEY, GEMINI_API_KEY, OPENROUTER_API_KEY
```

### bytebot-holo (Python Service)
```bash
cd packages/bytebot-holo

# Setup (one-time)
bash scripts/setup.sh       # Creates conda env, downloads models (~850MB)

# Development
conda activate omniparser   # or: source venv/bin/activate
python src/server.py        # Starts FastAPI service on port 9989

# Testing
curl http://localhost:9989/health
curl http://localhost:9989/models/status

# Note: Requires GPU (CUDA/MPS) or CPU fallback
# Models: YOLOv8 icon detection + Florence-2 captioning
```

## Docker Development

All stacks now include OmniParser v2.0 for semantic UI detection by default.

> **Note**: To disable OmniParser (e.g., on systems without GPU), set `BYTEBOT_CV_USE_HOLO=false` in `docker/.env`

### Full Stack (Standard)
```bash
docker compose -f docker/docker-compose.yml up -d --build
```

### Proxy Stack (with LiteLLM)
```bash
# Configure docker/.env with API keys and Hawkeye settings first
docker compose -f docker/docker-compose.proxy.yml up -d --build
```

### Optional Extension Stack (Legacy)
```bash
# Use docker-compose.omniparser.yml as an extension overlay
docker compose -f docker/docker-compose.yml -f docker/docker-compose.omniparser.yml up -d --build
```

### Service Ports
- bytebot-ui: 9992 (web interface)
- bytebot-agent: 9991 (API server)
- bytebotd: 9990 (desktop daemon + noVNC)
- bytebot-holo: 9989 (OmniParser service)
- PostgreSQL: 5432

## Holo 1.5-7B Platform Support

Holo 1.5-7B is a Qwen2.5-VL-based model trained on Windows, macOS, and Linux UI screenshots. Performance varies by platform:

### Docker (Multi-Architecture)

| Platform | Device | Performance | Notes |
|----------|--------|-------------|-------|
| x86_64 (Intel/AMD) + NVIDIA GPU | CUDA | ~0.6s/frame ⚡ | **Recommended for production** |
| x86_64 (Intel/AMD) CPU-only | CPU | ~8-15s/frame | Works but slow |
| ARM64 (Apple Silicon) in Docker | CPU | ~8-15s/frame ⚠️ | **MPS not available in containers** |

**Auto-detection**: Set `HOLO_DEVICE=auto` (default) to automatically use the best available device.

### Native Execution (Apple Silicon)

For GPU acceleration on Apple Silicon (M1-M4), run OmniParser **natively outside Docker**:

- **Performance**: ~1-2s/frame with MPS (Metal Performance Shaders)
- **Setup Guide**: See `packages/bytebot-holo/NATIVE_MACOS.md`
- **Architecture**: Run OmniParser natively, connect from Docker via `host.docker.internal:9989`

**Why native?** Docker Desktop on macOS doesn't pass through MPS/Metal GPU access to containers.

### Configuration

```bash
# docker/.env
HOLO_DEVICE=auto  # Recommended: auto-detect (cuda > mps > cpu)
# HOLO_DEVICE=cpu   # Force CPU (slower but works everywhere)
# HOLO_DEVICE=cuda  # Force NVIDIA GPU (x86_64 only)
```

### Disabling Holo 1.5-7B

To disable Holo 1.5-7B (will fall back to Tesseract.js OCR only):

```bash
# docker/.env
BYTEBOT_CV_USE_HOLO=false
```

**Note:** Classical OpenCV-based CV methods (template matching, feature detection, contour detection) have been removed. Holo 1.5-7B + Tesseract.js provide superior detection accuracy.

## Database

Uses PostgreSQL with Prisma ORM:
- Schema: `packages/bytebot-agent/prisma/schema.prisma`
- Migrations: `npm run prisma:dev` (in bytebot-agent)
- Connection: `postgresql://postgres:postgres@localhost:5432/bytebotdb`

## AI Provider Integration

Supports multiple providers via environment variables:
- `ANTHROPIC_API_KEY` - Claude models
- `OPENAI_API_KEY` - GPT models
- `GEMINI_API_KEY` - Gemini models
- `OPENROUTER_API_KEY` - OpenRouter proxy

## Model Capability System

**Status:** Phase 1 Complete (Tier-based model profiling)
**Location:** `packages/bytebot-agent/src/models/`

The Model Capability System provides adaptive CV-first enforcement based on each AI model's vision capabilities. Models are categorized into three tiers:

### Tier 1: Strong CV Capability (Strict Enforcement)
- **Models**: GPT-4o, Claude Sonnet 4.5, Claude Opus 4, Claude 3.5 Sonnet
- **CV Success Rate**: 90-95%
- **Enforcement**: Strict CV-first workflow, no click violations allowed
- **Testing**: GPT-4o showed 100% CV-first compliance, adaptive keyboard fallback
- **Max CV Attempts**: 2
- **Loop Detection**: After 3 identical failures

### Tier 2: Medium CV Capability (Balanced Enforcement)
- **Models**: GPT-4o-mini, Gemini 2.0 Flash, Gemini 1.5 Pro, Claude 3 Haiku
- **CV Success Rate**: 75-85%
- **Enforcement**: Relaxed (allow 1 click violation)
- **Emphasis**: Keyboard shortcut suggestions
- **Max CV Attempts**: 3
- **Loop Detection**: After 3 identical failures

### Tier 3: Weak CV Capability (Minimal Enforcement)
- **Models**: Qwen3-VL, LLaVA, CogVLM
- **CV Success Rate**: 40-50%
- **Enforcement**: Suggest CV-first but don't block
- **Testing**: Qwen3-VL showed 4 click violations, stuck in detect→click loops
- **Max CV Attempts**: 2
- **Loop Detection**: After 2 identical failures (more sensitive)

### Usage

```typescript
// In your service
import { ModelCapabilityService } from './models/model-capability.service';

// Get model tier
const tier = modelCapabilityService.getModelTier('gpt-4o'); // Returns 'tier1'

// Get enforcement rules
const rules = modelCapabilityService.getEnforcementRules('qwen3-vl');
// Returns: { maxCvAttempts: 2, allowClickViolations: true, ... }

// Check if strict enforcement
const strictMode = modelCapabilityService.shouldEnforceCvFirst('claude-opus-4'); // true
```

### Configuration

Model profiles are defined in `packages/bytebot-agent/src/models/model-capabilities.config.ts`:
- Exact model name matching
- Pattern-based fuzzy matching
- Default tier assignment (Tier 2) for unknown models
- Per-tier enforcement rules

### Real-World Performance Data

Based on analysis of production sessions:

**GPT-4o Session:**
- 8 assistant messages
- 2 CV detection attempts
- 0 click violations ✅
- Clean workflow with keyboard shortcuts

**Qwen3-VL Session:**
- 21 assistant messages (2.6x more)
- 6 CV detection attempts
- 4 click violations ❌
- Stuck in detect→click loops
- Self-diagnosed loop and requested help

## Hawkeye-Specific Configuration

Key environment variables for precision features:
```bash
# Smart Focus System
BYTEBOT_SMART_FOCUS=true
BYTEBOT_SMART_FOCUS_MODEL=gpt-4o-mini
BYTEBOT_OVERVIEW_GRID=200
BYTEBOT_FOCUSED_GRID=25

# Grid Overlays
BYTEBOT_GRID_OVERLAY=true
BYTEBOT_GRID_DEBUG=false

# Coordinate Accuracy
BYTEBOT_COORDINATE_METRICS=true
BYTEBOT_COORDINATE_DEBUG=false
BYTEBOT_SMART_CLICK_SUCCESS_RADIUS=12

# Progressive Zoom
BYTEBOT_PROGRESSIVE_ZOOM_USE_AI=true
BYTEBOT_ZOOM_REFINEMENT=true

# Universal Element Detection
BYTEBOT_UNIVERSAL_TEACHING=true
BYTEBOT_ADAPTIVE_CALIBRATION=true
```

## Computer Vision Pipeline

The bytebot-cv package provides two detection methods:
- **Holo 1.5-7B** (PRIMARY) - Qwen2.5-VL-based UI element localization (cross-platform)
- **OCR** (FALLBACK) - Tesseract.js text extraction

**Note:** OpenCV and OmniParser have been removed to reduce complexity. Holo 1.5-7B provides superior cross-platform semantic understanding trained on Windows, macOS, and Linux UI screenshots.

### CV Services Architecture
Core detection services in `packages/bytebot-cv/src/`:
- `services/enhanced-visual-detector.service.ts` - Holo 1.5 + OCR orchestrator
- `services/holo-client.service.ts` - Holo 1.5-7B REST client
- `services/cv-activity-indicator.service.ts` - Real-time CV activity tracking
- `services/element-detector.service.ts` - Stub (use Holo 1.5 instead)
- `services/visual-pattern-detector.service.ts` - Stub (use Holo 1.5 instead)
- `services/text-semantic-analyzer.service.ts` - OCR text analysis
- `services/universal-detector.service.ts` - Universal element detection
- `detectors/ocr/ocr-detector.ts` - Tesseract.js OCR implementation

### Holo 1.5-7B Integration

**Status: FULL INTEGRATION COMPLETE ✅** (Holo 1.5-7B replaces OmniParser)
**Documentation:** See `packages/bytebot-holo/README.md` for details

Holo 1.5-7B provides cross-platform semantic UI element localization with **full pipeline integration**:

**Core Features (All Implemented):**
- **Qwen2.5-VL Base** - 7B parameter vision-language model
- **GGUF Quantization** - Q4_K_M (4-bit) or Q8_0 (8-bit) for efficiency
- **Multi-prompt Detection** - Multiple detection passes for comprehensive coverage
- **Set-of-Mark Annotations** - Numbered visual grounding for VLM click accuracy
- **Cross-platform Training** - Windows, macOS, Linux UI screenshots
- **Performance Profiles** - SPEED, BALANCED, QUALITY modes

**Performance:**
- NVIDIA GPU: ~2-4s/frame (Q4_K_M quantization)
- Apple Silicon MPS: ~4-6s/frame (Q4_K_M quantization)
- CPU: ~15-30s/frame
- Element Coverage: High accuracy across platforms
- Cross-platform: Works identically on Windows/Linux/macOS

**Benchmarks:**
- ScreenSpot-Pro: 57.94 (Holo 1.5-7B) vs 29.00 (Qwen2.5-VL-7B base)
- Trained on ScreenSpot, ScreenSpot-V2, GroundUI-Web, WebClick datasets

Configuration:
```bash
# Holo 1.5-7B Settings
BYTEBOT_CV_USE_HOLO=true
HOLO_URL=http://localhost:9989
HOLO_DEVICE=auto  # auto, cuda, mps (Apple Silicon), or cpu
HOLO_MIN_CONFIDENCE=0.05
HOLO_PERFORMANCE_PROFILE=BALANCED  # SPEED, BALANCED, or QUALITY

# Set-of-Mark Visual Grounding
BYTEBOT_USE_SOM_SCREENSHOTS=true  # Enable numbered element annotations
```

**API Usage:**
```typescript
// Parse screenshot with Holo 1.5-7B
const result = await holoClient.parseScreenshot(buffer, {
  task: 'click on submit button',  // Optional: specific task
  detect_multiple: true,            // Detect multiple elements
  include_som: true,                // Include SOM annotations
  performance_profile: 'BALANCED',  // Performance mode
});

// Result includes rich metadata
console.log(`Elements: ${result.count}`);
console.log(`Processing time: ${result.processing_time_ms}ms`);
console.log(`Model: ${result.model}`); // "holo-1.5-7b"
```

## Testing

All NestJS packages use Jest:
- Test files: `*.spec.ts`
- E2E tests: `test/jest-e2e.json` config
- UI tests: Native Node.js test runner

## Key Technical Notes

- Node.js ≥20.0.0 required for all packages (Python 3.12 for bytebot-holo)
- TypeScript strict mode enabled
- Monorepo structure requires building shared package first
- **OpenCV removed** - system now uses Holo 1.5-7B (primary) + Tesseract.js (fallback)
- Universal coordinates stored in `config/universal-coordinates.yaml`
- Desktop accuracy metrics available at `/desktop` UI route
- Holo 1.5-7B requires 8-10GB VRAM (NVIDIA GPU, Apple Silicon M1-M4, or CPU fallback)

### Platform-Specific Native Modules

**Sharp (Image Processing):**
- Bytebotd uses `sharp` for image resizing/cropping (screenshot ROI extraction)
- Sharp contains platform-specific native binaries (`.node` files)
- **Windows containers**: Install.bat automatically rebuilds sharp for Windows after copying Linux-built artifacts
- **Manual rebuild** (if needed): `npm rebuild sharp --platform=win32 --arch=x64`
- **Cross-platform**: Use `npm install --cpu=<arch> --os=<platform> sharp` for multi-platform builds

**Other native modules:**
- `uiohook-napi`: Input tracking (keyboard/mouse events) - platform-specific
- `@nut-tree-fork/nut-js`: Keyboard shortcuts - platform-specific
- These are currently Linux-only and not rebuilt for Windows (not critical for core functionality)

## Module Architecture

### bytebot-agent Main Modules
Key NestJS modules in `packages/bytebot-agent/src/`:
- `agent/agent.module.ts` - Core agent orchestration
- `tasks/tasks.module.ts` - Task management
- `messages/messages.module.ts` - Message handling
- `anthropic/anthropic.module.ts` - Claude API integration
- `openai/openai.module.ts` - OpenAI API integration
- `google/google.module.ts` - Gemini API integration
- `proxy/proxy.module.ts` - LiteLLM proxy integration
- `settings/settings.module.ts` - Configuration management
- `prisma/prisma.module.ts` - Database ORM
- `computer-vision/cv-activity.controller.ts` - CV telemetry endpoints

### bytebotd Main Modules
Key NestJS modules in `packages/bytebotd/src/`:
- `computer-use/computer-use.module.ts` - Desktop control (screenshot, click, type)
- `input-tracking/input-tracking.module.ts` - Mouse/keyboard tracking
- `nut/nut.module.ts` - Keyboard shortcut handling via nut-js
- `mcp/bytebot-mcp.module.ts` - Model Context Protocol integration

## Smart Focus System

Hawkeye's signature precision feature. See `docs/SMART_FOCUS_SYSTEM.md` for full details.

Three-stage workflow:
1. **Coarse** - Overview with `BYTEBOT_OVERVIEW_GRID` (default: 200px)
2. **Focus** - Zoom into region with `BYTEBOT_FOCUSED_GRID` (default: 25px)
3. **Click** - Final coordinate selection

Configuration via environment variables:
- `BYTEBOT_SMART_FOCUS` - Enable/disable (default: true)
- `BYTEBOT_SMART_FOCUS_MODEL` - Model for focus reasoning (e.g., gpt-4o-mini)
- `BYTEBOT_OVERVIEW_GRID` - Coarse grid size
- `BYTEBOT_REGION_GRID` - Region grid size
- `BYTEBOT_FOCUSED_GRID` - Fine grid size

## Set-of-Mark (SOM) Visual Annotations

**Status:** ✅ COMPLETE - Full implementation with vision/non-vision model support
**Click Accuracy:** 70-85% with SOM numbers vs 20-30% with raw element IDs

SOM is a visual grounding technique where UI elements are annotated with numbered bounding boxes on screenshots. This allows models to reference elements by visible numbers (e.g., "click element 5") instead of cryptic IDs, significantly improving click accuracy.

### Full Implementation (All Phases Complete)

**Phase 1: Backend Infrastructure** ✅
- Python Service (bytebot-holo): `generate_som_image()` overlays numbered boxes
- TypeScript Client (bytebot-cv): Automatic SOM generation on every detection
- API returns `som_image` field with base64-encoded annotated images

**Phase 2: Agent Integration** ✅
- Vision models: Receive screenshots with numbered RED BOXES [0], [1], [2]
- Non-vision models: Receive numbered text lists in detection response
- Automatic SOM presentation based on model vision capability
- Environment variable: `BYTEBOT_USE_SOM_SCREENSHOTS=true` (enabled by default)

**Phase 3: Element Number Resolution** ✅
- Backend automatically resolves number → element ID → coordinates
- `computer_click_element({ element_id: "0" })` - Click element [0]
- Element numbers persist until next detection
- Supports flexible formats: "5", "element 3", "box 12"

**Phase 4: System Prompt Optimization** ✅
- Strong emphasis on SOM as PRIMARY clicking method
- Clear preference hierarchy: SOM numbers > element IDs > grid coordinates
- Vision vs non-vision model guidance
- SOM quick reference in CV-FIRST section
- Enhanced tool descriptions emphasizing SOM

**Phase 5: UI Enhancements** ✅
- Real-time CV activity indicators showing Holo metadata
- Performance profile display (SPEED/BALANCED/QUALITY)
- Quantization display (Q4_K_M/Q8_0)
- Task description and detection status
- Processing time and element count

### Usage

**Vision Models (Claude Opus 4, GPT-4o):**
1. Run `computer_detect_elements({ description: "Install button" })`
2. See screenshot with RED BOXES: [0] Install, [1] Cancel, [2] Settings
3. Click: `computer_click_element({ element_id: "0" })`

**Non-Vision Models (GPT-3.5, Claude Haiku):**
1. Run `computer_detect_elements({ description: "Install button" })`
2. Receive: "Elements: [0] Install button, [1] Cancel button, [2] Settings gear icon"
3. Click: `computer_click_element({ element_id: "0" })`

### Testing SOM Generation

```bash
# Start Holo 1.5-7B service
cd packages/bytebot-holo
python src/server.py

# Test SOM endpoint
curl -X POST http://localhost:9989/parse \
  -H "Content-Type: application/json" \
  -d '{"image":"<base64_screenshot>","include_som":true}'
```

Response includes `som_image` field with numbered boxes overlaid on detected elements.

### Configuration

```bash
# Enable/disable SOM (enabled by default)
BYTEBOT_USE_SOM_SCREENSHOTS=true

# SOM works automatically with Holo 1.5-7B
BYTEBOT_CV_USE_HOLO=true
```

### Performance Impact

- **Click Accuracy**: 70-85% with SOM numbers vs 20-30% with raw element IDs
- **Cognitive Load**: Reduced - use visible numbers instead of memorizing IDs
- **Disambiguation**: Clear distinction between similar elements ("button 3" vs "button 7")
- **Processing Overhead**: Minimal - SOM generation adds <100ms

## CV Activity Monitoring

**Status:** ✅ COMPLETE - Real-time Holo metadata display in UI

The system provides comprehensive CV activity monitoring with live Holo 1.5-7B metadata:

### Features

**Real-time Activity Indicators:**
- Active CV methods with live status (pulsing indicators)
- Performance profile display (SPEED/BALANCED/QUALITY with icons)
- Quantization level (Q4_K_M/Q8_0)
- Device type (NVIDIA GPU ⚡ / Apple GPU 🍎 / CPU 💻)
- Processing time and element count

**Detection History:**
- Recent detections with element counts
- Cache hit indicators (⚡)
- Method breakdown (Holo 1.5-7B primary)
- Processing duration

**Click History:**
- Success/failure indicators (✓/❌)
- Element IDs clicked
- Detection methods used

**Statistics Dashboard:**
- Total detections and clicks
- Success rate percentage
- Cache hit rate

### UI Components

- **Task Page Header**: Compact Holo status card with GPU info
- **Chat Panel**: Inline CV activity during agent execution
- **Direct Vision Mode**: Purple badge when CV is bypassed

### Backend APIs

```typescript
// Get current CV activity snapshot
GET /api/cv-activity/stream
// Returns: activeMethods, performance, holoDevice, gpuInfo, etc.

// Get detection and click summary
GET /api/cv-detection/summary
// Returns: recentDetections, recentClicks, statistics
```

### Direct Vision Mode

When using vision-capable models (Claude Opus 4, GPT-4o) with `directVisionMode=true`:
- CV indicators show "Direct Vision Mode" badge
- Holo 1.5-7B detection bypassed
- Model uses native vision directly on screenshots
- Faster performance, fewer intermediate steps