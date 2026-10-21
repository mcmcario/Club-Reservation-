export async function api(path, options = {}) {
  const response = await fetch(path, { credentials: 'same-origin', ...options,
    headers: { ...(options.body && !(options.body instanceof Blob) ? { 'Content-Type': 'application/json' } : {}), ...options.headers } });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || `Request failed (${response.status}).`);
  return data;
}

export async function uploadPicture(file) {
  if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type) || file.size > 5 * 1024 * 1024) throw new Error('Choose a JPG, PNG, or WebP image up to 5 MB.');
  return api('/api/admin/images', { method: 'POST', headers: { 'Content-Type': file.type }, body: file });
}
