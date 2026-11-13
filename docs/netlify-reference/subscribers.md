# Signup and subscriber handling

Form: `project-updates` on the **personal** Netlify project. It uses a native POST to `/thanks/`, `data-netlify="true"`, and a `bot-field` honeypot. Enable form detection before deploying the full personal page. It stores requests; it does not send newsletters or confirmation emails automatically.

## Consent version v1

Exact checkbox wording, introduced with this migration:

> Email me when Zane Giordano releases a new project.

| Field | Expected value |
| --- | --- |
| `form-name` | `project-updates` |
| `email` | Submitted email |
| `consent` | `yes` |
| `consent_version` | `v1` |
| `bot-field` | Empty |
| Receipt time | Netlify submission metadata, verified in dashboard/export |

The checkbox is required and unchecked in ordinary browsers. Browser validation is not a server-side consent guarantee: crafted requests can omit or forge fields. Before mailing, accept only verified records with expected affirmative consent/version, and preserve the exact versioned wording. If address-ownership confirmation is required, configure double opt-in in a mailing service before sending.

Use your own address for launch tests. Verify the dashboard and CSV rather than treating the success page as evidence. Review the spam folder for false positives and remove synthetic records after testing.

Export a private backup after launch and before changing the form or personal project. Keep CSV exports, email addresses and suppression lists outside Git and publish folders. The ignored `private/` and `subscriber-exports/` names are only a guardrail, not encryption or a substitute for checking uploads.

When mailing starts, import into a service that supports unsubscribe handling. Deduplicate by normalized email, retain affirmative-consent evidence, and preserve prior unsubscribes/suppressions across every import. Do not interpret repeat signup as permission to override an opt-out automatically. Update the public signup copy when the actual mailing/unsubscribe process changes.

References: [form setup](https://docs.netlify.com/manage/forms/setup/), [submission management and export](https://docs.netlify.com/manage/forms/submissions/). Check the team's actual plan rather than relying on an old quoted form allowance.
