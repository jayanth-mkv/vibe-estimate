# Submission copy and service confirmations

Prepared for the form supplied on September 6, 2026. This is copy to review and submit, not a claim that a social post or form has been published.

## Links

| Form field | Use |
| --- | --- |
| Working prototype | https://vibe-estimate.xplormity.com |
| Optional walkthrough | https://vibe-estimate.xplormity.com/demo/index.html |
| Public code | The public GitHub repository address already entered in the form; [open the repository](..). Public access was checked without authentication. |
| Demo social post | The permalink of your actual published post containing **#AccelerateAIwithCloudRun**. A repository or video URL alone is not the social-post permalink. |

## Brief description

Copy only the following paragraph into the 1,024-character field:

VibeEstimate helps interior designers and homeowners turn ideas into a shared, reviewable home design. Start from a measured home, ask Gemini for furniture, lighting or finish changes, and explore the result in 2D/3D. Both people can chat around the same saved layout, review an exact version and download its draft agreement. Firebase Authentication verifies each person; Cloud Firestore stores private projects, messages, immutable revisions and member-scoped agreements. A Next.js frontend and Express API run together on Google Cloud Run. Server-side Gemini via Vertex AI powers context-aware edits and drafting; deterministic checks enforce selection scope, catalog assets and geometry. Secret Manager injects Firebase web configuration; Gemini uses Cloud Run runtime identity rather than an API key. Terraform and Cloud Build manage deployment. Separate designer/homeowner sessions and real Gemini workflows were tested and recorded.

## Which services to confirm

| Form option | Current evidence |
| --- | --- |
| **User authentication via Firebase** | **Select.** Production tests verified separate Firebase identities and server-side token checks. Guest entry is supported. Google linking is implemented, but completed personal Google consent remains unverified. |
| **Multi-turn interaction with the Gemini API** | **Select.** Proposal reviews preserve user/model history. Home edits use the current saved scene, brief and follow-up prompt; agreement drafting uses the frozen room conversation and verified changes. Do not claim that every home request replays the whole chat transcript. |
| **User-isolated Firestore document storage** | **Select.** Private records are owner-scoped; shared design access requires explicit room membership. Save/reload and unrelated-user denial passed. |
| **Secure API key retrieval via Google Cloud Secret Manager** | **Do not confirm as Gemini API-key retrieval.** Production authenticates Gemini through the attached Vertex runtime identity. Its Secret Manager binding supplies Firebase browser configuration, which does not establish Gemini credential retrieval. If the form requires every box, this requirement remains unresolved. |
| **Others** | **Select if desired:** Vertex AI runtime authentication, Terraform, Cloud Build, Pascal 2D/3D rendering, versioned design review and shared draft agreements. The description above includes the additional Google Cloud services. |

The [official challenge codelab](https://codelabs.developers.google.com/codelabs/cloud-run/cloud-run-ai-challenge) lists API-key retrieval among its baseline features and describes the public prototype/repository/social deliverables. Current implementation evidence is in [V1 verification](v1-verification.md), [build provenance](ai-studio-evidence.md) and the [deployment contract](deployment.md#private-configuration). Do not turn the configured Firebase web secret into a claim about a Gemini API key.

## Demo social-post draft

I built VibeEstimate to help interior designers and homeowners see the same idea before agreeing on a design.

Choose a home, ask Gemini for lights, furniture or finishes, and inspect the changes in 2D/3D. A designer and homeowner can then chat around the same saved layout, review an exact version and download a shared draft agreement.

The walkthrough shows two separate sessions side by side, real Gemini requests and visible clicks, through to matching agreement downloads and reopening.

Built with Firebase Authentication, Cloud Firestore, Gemini on Vertex AI and Google Cloud Run, with Terraform and Cloud Build handling deployment.

Try it: https://vibe-estimate.xplormity.com

Watch the 2:56 demo: https://vibe-estimate.xplormity.com/demo/index.html

#AccelerateAIwithCloudRun #GoogleCloud #Gemini #Firebase

After publishing, copy that post's permalink into the social-post field. The [MP4](../frontend/public/demo/walkthrough.mp4) is also available if the platform supports uploading the video directly. No post or submission has been made by this documentation change.
