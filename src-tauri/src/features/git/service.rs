use git2::{
    DiffFormat, DiffOptions, IndexAddOption, ObjectType, Repository, Signature, Sort,
    StatusOptions, StatusShow,
};
use serde::Serialize;
use std::path::Path;

#[derive(Debug, Clone, Serialize)]
pub struct GitFileStatus {
    pub path: String,
    pub status: String,
}

#[derive(Debug, Clone, Serialize)]
pub struct GitStatus {
    pub branch: String,
    pub is_dirty: bool,
    pub ahead: usize,
    pub behind: usize,
    pub files: Vec<GitFileStatus>,
}

#[derive(Debug, Clone, Serialize)]
pub struct GitCommit {
    pub hash: String,
    pub short_hash: String,
    pub author: String,
    pub timestamp_ms: i64,
    pub message: String,
}

#[derive(Debug, Clone, Serialize)]
pub struct GitDiffLine {
    #[serde(rename = "type")]
    pub line_type: String,
    pub content: String,
    pub old_line: Option<u32>,
    pub new_line: Option<u32>,
}

#[derive(Debug, Clone, Serialize)]
pub struct GitDiffHunk {
    pub header: String,
    pub lines: Vec<GitDiffLine>,
}

#[derive(Debug, Clone, Serialize)]
pub struct GitDiff {
    pub additions: usize,
    pub deletions: usize,
    pub hunks: Vec<GitDiffHunk>,
}

fn open_repo(vault_path: &str) -> Result<Repository, String> {
    Repository::open(vault_path).map_err(|e| format!("failed to open repo: {}", e))
}

fn repo_index(repo: &Repository) -> Result<git2::Index, String> {
    repo.index().map_err(|e| format!("failed to get index: {}", e))
}

fn default_signature() -> Result<Signature<'static>, String> {
    Signature::now("LeapGrowNotes", "leapgrownotes@local")
        .map_err(|e| format!("failed to create signature: {}", e))
}

fn write_default_gitignore_if_missing(vault_path: &str) -> Result<(), String> {
    let gitignore_path = Path::new(vault_path).join(".gitignore");
    if gitignore_path.exists() {
        return Ok(());
    }

    std::fs::write(
        &gitignore_path,
        "node_modules/\n.DS_Store\n*.tmp\n.env\nThumbs.db\n.leapgrownotes/\n",
    )
    .map_err(|e| format!("failed to write .gitignore: {}", e))
}

fn status_string(s: git2::Status) -> &'static str {
    if s.is_conflicted() {
        "conflicted"
    } else if s.is_index_new() {
        "added"
    } else if s.is_wt_new() {
        "untracked"
    } else if s.is_wt_deleted() || s.is_index_deleted() {
        "deleted"
    } else if s.is_wt_modified()
        || s.is_index_modified()
        || s.is_wt_renamed()
        || s.is_index_renamed()
    {
        "modified"
    } else {
        "untracked"
    }
}

#[tauri::command]
pub fn git_has_repo(vault_path: String) -> Result<bool, String> {
    Ok(Path::new(&vault_path).join(".git").exists())
}

#[tauri::command]
pub fn git_init_repo(vault_path: String) -> Result<(), String> {
    let repo = Repository::init(&vault_path).map_err(|e| format!("failed to init repo: {}", e))?;
    write_default_gitignore_if_missing(&vault_path)?;
    let mut index = repo_index(&repo)?;
    stage_all_files(&repo, &mut index)?;
    let (_, tree) = write_index_tree(&repo, &mut index)?;
    commit_tree(&repo, "Initial commit", &tree, None)?;
    Ok(())
}

#[tauri::command]
pub fn git_status(vault_path: String) -> Result<GitStatus, String> {
    let repo = open_repo(&vault_path)?;

    let branch = match repo.head() {
        Ok(head) => head.shorthand().unwrap_or("HEAD").to_string(),
        Err(_) => "HEAD".to_string(),
    };

    let mut opts = StatusOptions::new();
    opts.show(StatusShow::IndexAndWorkdir);
    opts.include_untracked(true);
    opts.recurse_untracked_dirs(true);

    let statuses = repo
        .statuses(Some(&mut opts))
        .map_err(|e| format!("failed to get status: {}", e))?;

    let files: Vec<GitFileStatus> = statuses
        .iter()
        .filter_map(|entry| {
            let path = entry.path()?.to_string();
            let status = entry.status();
            if status.is_ignored() {
                return None;
            }
            Some(GitFileStatus {
                path,
                status: status_string(status).to_string(),
            })
        })
        .collect();

    let is_dirty = !files.is_empty();

    let (ahead, behind) = compute_ahead_behind(&repo).unwrap_or((0, 0));

    Ok(GitStatus {
        branch,
        is_dirty,
        ahead,
        behind,
        files,
    })
}

fn compute_ahead_behind(repo: &Repository) -> Result<(usize, usize), git2::Error> {
    let head = repo.head()?;
    let local_oid = head
        .target()
        .ok_or_else(|| git2::Error::from_str("HEAD has no target"))?;

    let branch_name = head
        .shorthand()
        .ok_or_else(|| git2::Error::from_str("no branch name"))?;

    let upstream_name = format!("refs/remotes/origin/{}", branch_name);
    let upstream_ref = repo.find_reference(&upstream_name)?;
    let upstream_oid = upstream_ref
        .target()
        .ok_or_else(|| git2::Error::from_str("upstream has no target"))?;

    repo.graph_ahead_behind(local_oid, upstream_oid)
}

fn stage_selected_files(
    index: &mut git2::Index,
    vault_path: &str,
    paths: &[String],
) -> Result<(), String> {
    for path in paths {
        let full = Path::new(vault_path).join(path);
        if full.exists() {
            index
                .add_path(Path::new(path))
                .map_err(|e| format!("failed to stage {}: {}", path, e))?;
            continue;
        }
        index
            .remove_path(Path::new(path))
            .map_err(|e| format!("failed to remove {}: {}", path, e))?;
    }
    Ok(())
}

fn stage_all_files(repo: &Repository, index: &mut git2::Index) -> Result<(), String> {
    index
        .add_all(["*"].iter(), IndexAddOption::DEFAULT, None)
        .map_err(|e| format!("failed to stage all: {}", e))?;

    let statuses = repo
        .statuses(None)
        .map_err(|e| format!("failed to get status: {}", e))?;
    for entry in statuses.iter() {
        if entry.status().is_wt_deleted() || entry.status().is_index_deleted() {
            if let Some(path) = entry.path() {
                let _ = index.remove_path(Path::new(path));
            }
        }
    }
    Ok(())
}

fn stage_commit_files(
    repo: &Repository,
    index: &mut git2::Index,
    vault_path: &str,
    files: Option<Vec<String>>,
) -> Result<(), String> {
    match files {
        Some(paths) => stage_selected_files(index, vault_path, &paths),
        None => stage_all_files(repo, index),
    }
}

fn write_index_tree<'repo>(
    repo: &'repo Repository,
    index: &mut git2::Index,
) -> Result<(git2::Oid, git2::Tree<'repo>), String> {
    index
        .write()
        .map_err(|e| format!("failed to write index: {}", e))?;
    let tree_oid = index
        .write_tree()
        .map_err(|e| format!("failed to write tree: {}", e))?;
    let tree = repo
        .find_tree(tree_oid)
        .map_err(|e| format!("failed to find tree: {}", e))?;
    Ok((tree_oid, tree))
}

fn head_parent_commit(repo: &Repository) -> Option<git2::Commit<'_>> {
    repo.head().ok().and_then(|head| head.peel_to_commit().ok())
}

fn ensure_tree_has_changes(parent: Option<&git2::Commit<'_>>, tree_oid: git2::Oid) -> Result<(), String> {
    if let Some(parent_commit) = parent {
        if parent_commit.tree_id() == tree_oid {
            return Err("nothing to commit".to_string());
        }
    }
    Ok(())
}

fn commit_tree(
    repo: &Repository,
    message: &str,
    tree: &git2::Tree<'_>,
    parent: Option<&git2::Commit<'_>>,
) -> Result<String, String> {
    let sig = default_signature()?;
    let parents: Vec<&git2::Commit<'_>> = parent.into_iter().collect();
    let oid = repo
        .commit(Some("HEAD"), &sig, &sig, message, tree, &parents)
        .map_err(|e| format!("failed to commit: {}", e))?;
    Ok(oid.to_string())
}

#[tauri::command]
pub fn git_stage_and_commit(
    vault_path: String,
    message: String,
    files: Option<Vec<String>>,
) -> Result<String, String> {
    let repo = open_repo(&vault_path)?;
    let mut index = repo_index(&repo)?;
    stage_commit_files(&repo, &mut index, &vault_path, files)?;
    let (tree_oid, tree) = write_index_tree(&repo, &mut index)?;
    let parent = head_parent_commit(&repo);
    ensure_tree_has_changes(parent.as_ref(), tree_oid)?;
    commit_tree(&repo, &message, &tree, parent.as_ref())
}

#[tauri::command]
pub fn git_create_tag(vault_path: String, name: String, message: String) -> Result<(), String> {
    let repo = open_repo(&vault_path)?;
    let head = repo
        .head()
        .map_err(|e| format!("failed to resolve HEAD: {}", e))?;
    let target = head
        .peel(ObjectType::Commit)
        .map_err(|e| format!("failed to peel HEAD to commit: {}", e))?;
    let sig = default_signature()?;
    repo.tag(&name, &target, &sig, &message, false)
        .map_err(|e| format!("failed to create tag: {}", e))?;
    Ok(())
}

#[tauri::command]
pub fn git_log(
    vault_path: String,
    file_path: Option<String>,
    limit: usize,
) -> Result<Vec<GitCommit>, String> {
    let repo = open_repo(&vault_path)?;

    let mut revwalk = repo
        .revwalk()
        .map_err(|e| format!("failed to create revwalk: {}", e))?;
    revwalk
        .push_head()
        .map_err(|e| format!("failed to push HEAD: {}", e))?;
    revwalk
        .set_sorting(Sort::TIME)
        .map_err(|e| format!("failed to set sorting: {}", e))?;

    let mut commits = Vec::new();

    for oid_result in revwalk {
        if commits.len() >= limit {
            break;
        }

        let oid = oid_result.map_err(|e| format!("revwalk error: {}", e))?;
        let commit = repo
            .find_commit(oid)
            .map_err(|e| format!("failed to find commit: {}", e))?;

        if let Some(ref fp) = file_path {
            if !commit_touches_file(&repo, &commit, fp) {
                continue;
            }
        }
        commits.push(to_git_commit(commit));
    }

    Ok(commits)
}

fn commit_touches_file(repo: &Repository, commit: &git2::Commit, path: &str) -> bool {
    let tree = match commit.tree() {
        Ok(t) => t,
        Err(_) => return false,
    };

    if commit.parent_count() == 0 {
        return tree.get_path(Path::new(path)).is_ok();
    }

    for i in 0..commit.parent_count() {
        let parent = match commit.parent(i) {
            Ok(p) => p,
            Err(_) => continue,
        };
        let parent_tree = match parent.tree() {
            Ok(t) => t,
            Err(_) => continue,
        };

        let mut diff_opts = DiffOptions::new();
        diff_opts.pathspec(path);

        let diff =
            match repo.diff_tree_to_tree(Some(&parent_tree), Some(&tree), Some(&mut diff_opts)) {
                Ok(d) => d,
                Err(_) => continue,
            };

        if diff.stats().map(|s| s.files_changed()).unwrap_or(0) > 0 {
            return true;
        }
    }

    false
}

fn to_git_commit(commit: git2::Commit<'_>) -> GitCommit {
    let hash = commit.id().to_string();
    let short_hash = hash[..7.min(hash.len())].to_string();

    GitCommit {
        hash,
        short_hash,
        author: commit.author().name().unwrap_or("Unknown").to_string(),
        timestamp_ms: commit.time().seconds() * 1000,
        message: commit.message().unwrap_or("").to_string(),
    }
}

fn resolve_tree_from_commit<'repo>(
    repo: &'repo Repository,
    commit_ref: &str,
) -> Result<git2::Tree<'repo>, String> {
    let obj = repo
        .revparse_single(commit_ref)
        .map_err(|e| format!("failed to find commit {}: {}", commit_ref, e))?;
    obj.peel(ObjectType::Tree)
        .map_err(|e| format!("failed to peel to tree: {}", e))?
        .into_tree()
        .map_err(|_| "not a tree".to_string())
}

fn build_diff_between_trees<'repo>(
    repo: &'repo Repository,
    tree_a: &'repo git2::Tree<'repo>,
    tree_b: &'repo git2::Tree<'repo>,
    file_path: Option<&str>,
) -> Result<git2::Diff<'repo>, String> {
    let mut diff_opts = DiffOptions::new();
    if let Some(path) = file_path {
        diff_opts.pathspec(path);
    }

    repo.diff_tree_to_tree(Some(tree_a), Some(tree_b), Some(&mut diff_opts))
        .map_err(|e| format!("failed to diff: {}", e))
}

fn line_type(origin: char) -> &'static str {
    match origin {
        '+' => "addition",
        '-' => "deletion",
        _ => "context",
    }
}

fn abbreviated_hash(hash: &str) -> &str {
    if hash.len() >= 7 {
        &hash[..7]
    } else {
        hash
    }
}

fn collect_diff_hunks(diff: &git2::Diff<'_>) -> Result<Vec<GitDiffHunk>, String> {
    let mut hunks: Vec<GitDiffHunk> = Vec::new();

    diff.print(DiffFormat::Patch, |_delta, hunk, line| {
        if let Some(hunk_header) = hunk {
            let header = String::from_utf8_lossy(hunk_header.header()).to_string();
            if hunks.last().map(|h| h.header != header).unwrap_or(true) {
                hunks.push(GitDiffHunk {
                    header,
                    lines: Vec::new(),
                });
            }
        }

        let content = String::from_utf8_lossy(line.content()).to_string();

        if let Some(current_hunk) = hunks.last_mut() {
            current_hunk.lines.push(GitDiffLine {
                line_type: line_type(line.origin()).to_string(),
                content,
                old_line: line.old_lineno(),
                new_line: line.new_lineno(),
            });
        }

        true
    })
    .map_err(|e| format!("failed to print diff: {}", e))?;

    Ok(hunks)
}

#[tauri::command]
pub fn git_diff(
    vault_path: String,
    commit_a: String,
    commit_b: String,
    file_path: Option<String>,
) -> Result<GitDiff, String> {
    let repo = open_repo(&vault_path)?;
    let tree_a = resolve_tree_from_commit(&repo, &commit_a)?;
    let tree_b = resolve_tree_from_commit(&repo, &commit_b)?;
    let diff = build_diff_between_trees(&repo, &tree_a, &tree_b, file_path.as_deref())?;

    let stats = diff
        .stats()
        .map_err(|e| format!("failed to get diff stats: {}", e))?;
    let additions = stats.insertions();
    let deletions = stats.deletions();
    let hunks = collect_diff_hunks(&diff)?;

    Ok(GitDiff {
        additions,
        deletions,
        hunks,
    })
}

#[tauri::command]
pub fn git_show_file_at_commit(
    vault_path: String,
    file_path: String,
    commit_hash: String,
) -> Result<String, String> {
    let repo = open_repo(&vault_path)?;

    let obj = repo
        .revparse_single(&commit_hash)
        .map_err(|e| format!("failed to find commit {}: {}", commit_hash, e))?;
    let commit = obj
        .peel_to_commit()
        .map_err(|e| format!("failed to peel to commit: {}", e))?;
    let tree = commit
        .tree()
        .map_err(|e| format!("failed to get tree: {}", e))?;

    let entry = tree
        .get_path(Path::new(&file_path))
        .map_err(|e| format!("file not found at commit: {}", e))?;

    let blob = repo
        .find_blob(entry.id())
        .map_err(|e| format!("failed to read blob: {}", e))?;

    String::from_utf8(blob.content().to_vec())
        .map_err(|e| format!("file is not valid utf-8: {}", e))
}

#[tauri::command]
pub fn git_restore_file(
    vault_path: String,
    file_path: String,
    commit_hash: String,
) -> Result<String, String> {
    let content =
        git_show_file_at_commit(vault_path.clone(), file_path.clone(), commit_hash.clone())?;
    let abs = Path::new(&vault_path).join(&file_path);

    if let Some(parent) = abs.parent() {
        std::fs::create_dir_all(parent)
            .map_err(|e| format!("failed to create directories: {}", e))?;
    }

    std::fs::write(&abs, &content).map_err(|e| format!("failed to write file: {}", e))?;

    let short_hash = abbreviated_hash(&commit_hash);
    let title = Path::new(&file_path)
        .file_stem()
        .and_then(|s| s.to_str())
        .unwrap_or(&file_path);
    let message = format!("Restore: {} to {}", title, short_hash);

    git_stage_and_commit(vault_path, message, Some(vec![file_path]))
}
