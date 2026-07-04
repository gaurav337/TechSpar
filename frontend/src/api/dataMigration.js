import { authFetch } from "./interview";

const API_BASE = "/api/data";

// Trigger the browser to download the current user's backup archive
export async function exportData() {
  const res = await authFetch(`${API_BASE}/export`);
  if (!res.ok) throw new Error(await res.text());

  const blob = await res.blob();
  let filename = "techspar-backup.tar.gz";
  const disposition = res.headers.get("content-disposition");
  if (disposition) {
    const m = /filename\*?=(?:UTF-8'')?["']?([^"';]+)/i.exec(disposition);
    if (m) filename = decodeURIComponent(m[1]);
  }

  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);

  return { filename, size: blob.size };
}

// Upload archive and merge to current user.options: { dbStrategy: 'skip'|'overwrite', overwriteFiles: boolean }
export async function importData(file, { dbStrategy = "skip", overwriteFiles = false } = {}) {
  const form = new FormData();
  form.append("file", file);
  form.append("db_strategy", dbStrategy);
  form.append("overwrite_files", overwriteFiles ? "true" : "false");

  const res = await authFetch(`${API_BASE}/import`, {
    method: "POST",
    body: form,
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}
