#!/bin/sh
# Local-only build and smoke test. Prints the immutable local image ID after all probes pass.
set -eu
base=$1
context=$(sh sites/studio/executor/prepare-image.sh "$base")
container=
cleanup() {
  if [ -n "$container" ]; then docker rm -f "$container" >/dev/null; fi
  rm -rf "$context"
}
trap cleanup EXIT
docker build --platform linux/amd64 --build-arg "STUDIO_CHECK_BASE=$base" --iidfile "$context/image-id" "$context" >&2
image=$(cat "$context/image-id")
fixture=studio-local-fixture-token-for-smoke-only
container=$(docker run --detach --platform linux/amd64 --publish 127.0.0.1::8080 --env "STUDIO_CHECK_SECRET=$fixture" "$image")
address=$(docker port "$container" 8080/tcp)
probe() {
  curl --silent --show-error --max-time 300 --output "$context/reply" --write-out '%{http_code}' "$@"
}
test "$(probe --retry 10 --retry-connrefused --retry-delay 1 -X POST "http://$address/check")" = 403
test "$(probe -H "Authorization: Bearer $fixture" -d "{\"base\":\"$base\",\"replacement\":\"<b>no</b>\"}" "http://$address/check")" = 400
test "$(probe -H "Authorization: Bearer $fixture" -d "{\"base\":\"$base\",\"replacement\":\"Studio validator smoke test\"}" "http://$address/check")" = 200
node -e 'const x=JSON.parse(require("node:fs").readFileSync(process.argv[1])); if (x.passed !== true || x.base !== process.argv[2] || !/^[a-f0-9]{64}$/.test(x.digest)) process.exit(1)' "$context/reply" "$base"
printf '%s\n' "$image"
