#!/bin/sh
# Run from the repository root. Print the isolated build context path.
set -eu
revision=$1
case "$revision" in *[!a-f0-9]*|'') exit 2 ;; esac
test "${#revision}" = 40
git merge-base --is-ancestor "$revision" origin/main
context=$(mktemp -d)
mkdir "$context/snapshot" "$context/runner"
archive="$context/source.tar"
git archive --format=tar "$revision" > "$archive"
tar -xf "$archive" -C "$context/snapshot"
rm "$archive"
cp sites/studio/executor/Dockerfile "$context/Dockerfile"
cp sites/studio/executor/check-server.mjs workers/studio-copy.mjs "$context/runner/"
printf '%s\n' "$context"
