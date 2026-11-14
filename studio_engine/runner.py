"""Local Docker validation boundary. No image pulls, generated commands, or host execution."""
import re
import subprocess
import uuid
from pathlib import Path


class DockerRunner:
    identity = "docker-static-check-1"

    def __init__(self, image):
        if not re.fullmatch(r"sha256:[0-9a-f]{64}", image):
            raise ValueError("runner_requires_immutable_local_image")
        self.image = image

    def validate(self, folder):
        public = (Path(folder) / "public").resolve()
        if any(path.is_symlink() for path in public.rglob("*")):
            raise ValueError("runner_symlink_rejected")
        name = "studio-check-" + uuid.uuid4().hex
        args = ["docker", "run", "--rm", "--pull=never", "--name", name,
                "--network=none", "--read-only", "--cap-drop=ALL",
                "--security-opt=no-new-privileges", "--pids-limit=32",
                "--memory=128m", "--cpus=0.5", "--user=65532:65532",
                "--mount", f"type=bind,src={public},dst=/input,readonly",
                "--workdir=/input", "--entrypoint=node", self.image,
                "--input-type=module", "-e",
                "import {spawnSync} from 'node:child_process';"
                "for(const file of ['app.mjs','model.mjs']) {"
                "const r=spawnSync('node',['--check',file],{stdio:'ignore',timeout:5000});"
                "if(r.status!==0) process.exit(1); }"]
        try:
            subprocess.run(args, timeout=20, check=True, capture_output=True)
        except subprocess.TimeoutExpired:
            subprocess.run(["docker", "kill", name], timeout=10, capture_output=True)
            raise ValueError("runner_timeout") from None
        except (OSError, subprocess.CalledProcessError):
            raise ValueError("runner_failed") from None
