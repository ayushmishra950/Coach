import toast from 'react-hot-toast';
import { api, errMsg } from './api';

export interface Uploaded { _id: string; name: string; size: number; mime: string }

export const MAX_UPLOAD_MB = 40;

/** Uploads one file (raw body). `isPublic` = website photo (owner only). */
export async function uploadFile(file: File, opts: { isPublic?: boolean; onProgress?: (pct: number) => void } = {}) {
  if (file.size > MAX_UPLOAD_MB * 1024 * 1024) throw new Error(`Files can be up to ${MAX_UPLOAD_MB} MB. For long videos paste a YouTube / Drive link instead.`);
  const { data } = await api.post<Uploaded>(`/files${opts.isPublic ? '?public=1' : ''}`, file, {
    headers: { 'Content-Type': file.type || 'application/octet-stream', 'X-File-Name': encodeURIComponent(file.name) },
    onUploadProgress: (e) => e.total && opts.onProgress?.(Math.round((e.loaded / e.total) * 100)),
    timeout: 10 * 60_000,
  });
  return data;
}

/** Public website photo URL (no login needed). */
export const publicFileUrl = (id?: string | null) => (id ? `/api/public/files/${id}` : '');

/** Opens a private file (needs the login token, so it is fetched first and shown from memory). */
export async function openFile(id: string, name = 'file', mime = '') {
  const t = toast.loading('Opening…');
  try {
    const { data } = await api.get<Blob>(`/files/${id}`, { responseType: 'blob', timeout: 10 * 60_000 });
    const url = URL.createObjectURL(data);
    const viewable = /^(application\/pdf|image\/|video\/|audio\/)/.test(mime || data.type);
    if (viewable) {
      const w = window.open(url, '_blank');
      if (!w) download(url, name);
    } else download(url, name);
    setTimeout(() => URL.revokeObjectURL(url), 5 * 60_000);
    toast.dismiss(t);
  } catch (e) {
    toast.error(errMsg(e, 'Could not open the file'), { id: t });
  }
}

function download(url: string, name: string) {
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
}

export const fmtSize = (n?: number | null) => (!n ? '' : n < 1024 * 1024 ? `${Math.max(1, Math.round(n / 1024))} KB` : `${(n / 1024 / 1024).toFixed(1)} MB`);
