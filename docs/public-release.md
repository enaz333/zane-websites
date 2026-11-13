# Prepare the first public release

> Historical migration record. For current environment setup and dispatch instructions, see [release automation](release-automation.md).

## Commit and push with GitHub Desktop

1. Select `zane-websites` in GitHub Desktop and choose **Fetch origin**. Confirm the remote is `https://github.com/enaz333/zane-websites.git`.
2. Review the **Changes** tab and commit the intended files. Use **Push origin** if direct pushes to `main` are still allowed. If branch protection is already active, create a branch from `main`, commit there, choose **Publish branch**, and open a pull request.
3. Review existing GitHub issues, pull requests, releases, and Actions logs and artifacts before making the repository public.

The original Exportify and iPhone Files screenshots in the initial commit are intentionally public with owner approval. The current checkout uses illustrations at the same URLs. Use a normal commit and push.

## Change visibility and set protections

1. In GitHub **Settings → General → Danger Zone → Change repository visibility**, choose **Make public** after reviewing the GitHub-hosted content.
2. In **Settings → Actions → General**, use read-only workflow permissions, leave Actions PR creation and approval disabled, and require approval for all external contributors' fork workflows. Run **Validate** manually once so the **Validate Workers** status check is available.
3. In **Settings → Branches**, protect `main`. Require a pull request with zero required approvals and leave Code Owner review optional for a solo owner. Require **Validate Workers** from GitHub Actions and require the branch to be up to date. Prevent bypass, force pushes, and deletion.
4. In **Settings → Environments**, create `cloudflare-production`. Use **Selected branches and tags** with one branch rule for `main`. Add `@enaz333` as required reviewer, leave **Prevent self-review** unchecked, and disable administrator bypass. The solo owner approves the queued deployment after reviewing the exact commit. See [publishing setup](publishing.md) for token scopes.
5. In **Settings → Code security**, enable secret scanning and push protection where available. Keep the repository variable `WORKERS_PUBLISH_ENABLED` unset through Cloudflare staging verification and explicit production approval. After staging and explicit approval, change the literal `false` in the publish job condition to `true` through a reviewed PR. Both merge-triggered and manual publishing also require the repository variable and protected main.
