#!/bin/sh
# Print a reviewable deployment command. Never invokes gcloud.
set -eu
test "$#" = 4
project=$1
region=$2
image=$3
version=$4
case "$project" in ''|*[!a-z0-9-]*) exit 2 ;; esac
case "$region" in ''|*[!a-z0-9-]*) exit 2 ;; esac
case "$version" in ''|*[!0-9]*) exit 2 ;; esac
prefix="$region-docker.pkg.dev/$project/studio-staging/validator@sha256:"
digest=${image#"$prefix"}
test "${#digest}" = 64
case "$digest" in *[!0-9a-f]*) exit 2 ;; esac
printf '%s\n' "gcloud run deploy studio-validator-staging --project=$project --region=$region --image=$image --service-account=studio-validator-staging@$project.iam.gserviceaccount.com --set-secrets=STUDIO_CHECK_SECRET=studio-validator-staging:$version --port=8080 --timeout=310s --min=0 --max=1 --max-instances=1 --concurrency=1 --allow-unauthenticated"
