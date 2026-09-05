# Preserved branch history

On 5 September 2026 all local branch tips were checked for reachability from `feat/spatial-home-studio`. The production changes were merged with their original commits intact. A complete Git bundle was created and verified outside the checkout before cleanup. Removing redundant branch names does not remove these commits from the surviving branch's history.

| Former branch | Preserved checkpoint |
| --- | --- |
| `feat/guided-workspace` | `b04d544` |
| `feat/shared-project-rooms` | `b7ca603` |
| `test/gemini-37-live-rooms` | `c62c56b` |
| `fix/emulator-session-restore` | `ecf1832` |
| `feat/connected-firebase-rooms` | `4fa4d70` |
| `snapshot/initial-connected-v1` | `4fa4d70`; also retained as an annotated tag of the same name |
| `fix/initial-production` | `666cb8a`, including connection stage `6544aeb` and runtime stage `91033db` |

The requested retained branches are `main`, `dev` and `feat/spatial-home-studio`. `main` and `dev` remain unchanged. Named working snapshots use annotated tags so the branch list stays small. Future verified v1 foundation work should receive `snapshot/v1-foundation` as a tag.

The temporary production worktree was an isolated checkout, not a second application repository. Its commits and production tooling are now consolidated. Terraform state, private configuration, build records and verification artifacts remain outside the checkout and are not removed by worktree cleanup. In-progress documentation changes in the primary checkout are preserved separately from branch cleanup.
