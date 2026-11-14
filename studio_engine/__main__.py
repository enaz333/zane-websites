import argparse
import json
from pathlib import Path
from .engine import Engine

parser = argparse.ArgumentParser(description="Studio local deterministic app build")
parser.add_argument("--workspace", required=True)
parser.add_argument("--spec", required=True)
parser.add_argument("--request-id", required=True)
parser.add_argument("--parent", type=int, default=0)
args = parser.parse_args()
engine = Engine(args.workspace)
try:
    result = engine.build(json.loads(Path(args.spec).read_text()), args.request_id, args.parent)
    print(json.dumps({key: result[key] for key in ("id", "state", "diagnostic", "digest")}, indent=2))
    raise SystemExit(0 if result["state"] == "review_ready" else 1)
finally:
    engine.close()
