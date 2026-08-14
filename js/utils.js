export const imageExt = /\.(jpe?g|png|webp|avif|gif)$/i;

export function naturalCompare(a, b) {
  return a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' });
}

export function baseName(name) {
  return String(name || '')
    .replace(/\.(cbz|cbr|zip|rar|pdf)$/i, '')
    .replace(/[._]+/g, ' ')
    .trim();
}

export function formatOf(name, type = '') {
  const normalized = String(name || '').toLowerCase();
  if (normalized.endsWith('.cbz') || normalized.endsWith('.zip')) return 'CBZ';
  if (normalized.endsWith('.cbr') || normalized.endsWith('.rar')) return 'CBR';
  if (normalized.endsWith('.pdf') || type === 'application/pdf') return 'PDF';
  return 'IMG';
}

export function bookId(file) {
  if (file?.idKey) return String(file.idKey);
  return `${file?.name || 'comic'}|${Number(file?.size) || 0}|${Number(file?.lastModified) || 0}`;
}

export function imageCollectionDescriptor(files) {
  const list = [...files]
    .filter(Boolean)
    .sort((a, b) => naturalCompare(a.webkitRelativePath || a.name || '', b.webkitRelativePath || b.name || ''));
  if (!list.length) return { name: 'Colección de imágenes', size: 0, lastModified: 0, type: 'image/*', idKey: 'images:empty' };

  const first = list[0];
  const relative = first.webkitRelativePath || '';
  const parent = relative.includes('/') ? relative.split('/').slice(0, -1).join('/') : '';
  const label = parent ? parent.split('/').at(-1) : `${baseName(first.name)}${list.length > 1 ? ` + ${list.length - 1}` : ''}`;
  const size = list.reduce((sum, file) => sum + (Number(file.size) || 0), 0);
  const lastModified = Math.max(...list.map((file) => Number(file.lastModified) || 0));
  return {
    name: label || baseName(first.name) || 'Colección de imágenes',
    size,
    lastModified,
    type: 'image/*',
    idKey: `images:${collectionHash(list)}:${list.length}:${size}`,
  };
}

function collectionHash(files) {
  let hash = 2166136261;
  for (const file of files) {
    const token = `${file.webkitRelativePath || file.name || ''}|${Number(file.size) || 0}|${Number(file.lastModified) || 0};`;
    for (let i = 0; i < token.length; i += 1) {
      hash ^= token.charCodeAt(i);
      hash = Math.imul(hash, 16777619);
    }
  }
  return (hash >>> 0).toString(36);
}

export async function blobToDataUrl(blob, maxW = 360, maxH = 540, quality = 0.78) {
  const url = URL.createObjectURL(blob);
  try {
    const image = await loadImage(url);
    const scale = Math.min(1, maxW / image.naturalWidth, maxH / image.naturalHeight);
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
    canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
    canvas.getContext('2d').drawImage(image, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL('image/jpeg', quality);
  } finally {
    URL.revokeObjectURL(url);
  }
}

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = reject;
    image.src = src;
  });
}

export function placeholderCover(title) {
  const words = String(title || 'COMIC').replace(/\s+/g, ' ').trim().slice(0, 54).split(' ');
  const lines = [];
  let line = '';
  for (const word of words) {
    const candidate = `${line} ${word}`.trim();
    if (candidate.length > 16 && line) {
      lines.push(line);
      line = word;
      if (lines.length === 2) break;
    } else {
      line = candidate;
    }
  }
  if (line && lines.length < 3) lines.push(line);
  const tspans = lines.slice(0, 3).map((text, index) => `<tspan x="50" dy="${index ? 68 : 0}">${escapeHtml(text)}</tspan>`).join('');
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="600" height="900" viewBox="0 0 600 900"><defs><linearGradient id="g" x2="1" y2="1"><stop stop-color="#15171c"/><stop offset="1" stop-color="#2a0d09"/></linearGradient></defs><rect width="600" height="900" fill="url(#g)"/><text x="50" y="110" fill="#ff4d2e" font-family="Arial,sans-serif" font-size="34" font-weight="900">COMIC READER 404</text><text x="50" y="350" fill="#ffffff" font-family="Arial,sans-serif" font-size="58" font-weight="900">${tspans}</text><text x="50" y="825" fill="#999999" font-family="Arial,sans-serif" font-size="24">LOCAL LIBRARY</text></svg>`;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

function escapeHtml(value) {
  return value.replace(/[&<>"']/g, (char) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#039;',
  }[char]));
}

export function mimeFromName(name) {
  const normalized = String(name || '').toLowerCase();
  if (normalized.endsWith('.png')) return 'image/png';
  if (normalized.endsWith('.webp')) return 'image/webp';
  if (normalized.endsWith('.avif')) return 'image/avif';
  if (normalized.endsWith('.gif')) return 'image/gif';
  return 'image/jpeg';
}
