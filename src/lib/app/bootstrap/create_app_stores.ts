import { VaultStore } from "$lib/features/vault";
import { NotesStore } from "$lib/features/note";
import { EditorStore } from "$lib/features/editor";
import { UIStore } from "$lib/app/orchestration/ui_store.svelte";
import { OpStore } from "$lib/app/orchestration/op_store.svelte";
import { SearchStore } from "$lib/features/search";
import { TabStore } from "$lib/features/tab";
import { GitStore } from "$lib/features/git";
import { LinksStore } from "$lib/features/links";
import { UserStore } from "$lib/features/user";

export type AppStores = {
  vault: VaultStore;
  notes: NotesStore;
  editor: EditorStore;
  ui: UIStore;
  op: OpStore;
  search: SearchStore;
  tab: TabStore;
  git: GitStore;
  links: LinksStore;
  user: UserStore;
};

export function create_app_stores(): AppStores {
  return {
    vault: new VaultStore(),
    notes: new NotesStore(),
    editor: new EditorStore(),
    ui: new UIStore(),
    op: new OpStore(),
    search: new SearchStore(),
    tab: new TabStore(),
    git: new GitStore(),
    links: new LinksStore(),
    user: new UserStore(),
  };
}
