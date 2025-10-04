# Docker Architecture Configuration

## Platform Architecture (x86_64)

All Docker containers are configured to run on **x86_64 (linux/amd64)** architecture for consistency across platforms.

### Why x86_64?

1. **Consistent Builds**: OpenCV and opencv4nodejs have pre-built binaries for x86_64
2. **Cross-Platform**: Works reliably on Mac (Intel/Apple Silicon), Linux, and Windows
3. **No Compilation**: Avoids platform-specific build issues
4. **Faster Builds**: Uses pre-built packages instead of compiling from source

### Platform-Specific Behavior

#### Apple Silicon (M1-M4 Macs)
- Docker containers run via Rosetta 2 emulation
- Performance: ~20% slower than native ARM64, but stable
- OmniParser: Runs **natively outside Docker** with MPS GPU for best performance
- See: `packages/bytebot-holo/NATIVE_MACOS.md`

#### x86_64 (Intel/AMD)
- Native performance, no emulation
- OmniParser: Runs inside Docker with CUDA support (if NVIDIA GPU available)

#### Windows
- Runs via WSL2 with x86_64 architecture
- Native performance in WSL2 environment

### Configuration

The `docker-compose.override.yml` file provides two key configurations:

1. **x86_64 Architecture** - Forces all containers to run on linux/amd64
2. **GPU Support** - Automatically enables NVIDIA GPU for OmniParser if available

```yaml
services:
  bytebot-agent:
    platform: linux/amd64
  bytebot-holo:
    platform: linux/amd64
    deploy:
      resources:
        reservations:
          devices:
            - driver: nvidia
              count: all
              capabilities: [gpu]
```

This file is **automatically loaded** by Docker Compose when running commands in the `docker/` directory.

**GPU Behavior:**
- If `nvidia-container-toolkit` is installed: Uses GPU (CUDA)
- If not installed: Gracefully falls back to CPU (no errors)
- Apple Silicon: GPU config is ignored (no NVIDIA support)

### Testing Architecture

Verify containers are running on x86_64:

```bash
docker inspect bytebot-agent | grep Architecture
# Should output: "Architecture": "amd64"
```

### Troubleshooting

#### Slow builds on Apple Silicon?
This is expected due to Rosetta 2 emulation. First build takes longer (~15-20 min), subsequent builds are cached.

#### Build failures?
1. Clear Docker build cache: `docker builder prune -f`
2. Remove node_modules: `rm -rf packages/*/node_modules`
3. Run fresh build: `./scripts/fresh-build.sh`

#### Need native ARM64 performance?
For CPU-intensive services (like Holo 1.5-7B on Mac), run natively outside Docker:
- See `scripts/setup-holo.sh` for native setup
- Docker services will connect to native service via `host.docker.internal`
