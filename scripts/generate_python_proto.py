from __future__ import annotations

import shutil
import subprocess
import sys
from pathlib import Path

GENERATED_PACKAGES = ("common", "events", "services")


def main() -> int:
    workspace_root = Path(__file__).resolve().parents[1]
    proto_root = workspace_root / "proto"
    output_root = workspace_root / "libs/common-python/src"

    for package in GENERATED_PACKAGES:
        shutil.rmtree(output_root / package, ignore_errors=True)

    proto_files = sorted(str(path.relative_to(proto_root)) for path in proto_root.glob("*/*.proto"))
    command = [
        sys.executable,
        "-m",
        "grpc_tools.protoc",
        f"-I={proto_root}",
        f"--python_out={output_root}",
        f"--grpc_python_out={output_root}",
        *proto_files,
    ]
    subprocess.run(command, cwd=workspace_root, check=True)

    for package in GENERATED_PACKAGES:
        package_dir = output_root / package
        package_dir.mkdir(exist_ok=True)
        (package_dir / "__init__.py").write_text("", encoding="utf-8")

    subprocess.run(
        [
            sys.executable,
            "-m",
            "ruff",
            "format",
            *[str(output_root / package) for package in GENERATED_PACKAGES],
        ],
        cwd=workspace_root,
        check=True,
    )

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
