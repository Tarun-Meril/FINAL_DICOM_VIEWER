const getDynamicPacsUrl = () => {
  const envUrl = import.meta.env.VITE_PACS_API_BASE_URL || import.meta.env.VITE_SHARE_API_BASE_URL;
  if (typeof window !== 'undefined' && window.location) {
    const searchParams = new URLSearchParams(window.location.search);
    const apiHost = searchParams.get('apiHost');
    if (apiHost) return apiHost.replace(/\/+$/, '');

    const hostname = window.location.hostname;
    if (hostname && hostname !== 'localhost' && hostname !== '127.0.0.1') {
      const isIpOrLocal = /^(\d{1,3}\.){3}\d{1,3}$/.test(hostname) || hostname.endsWith('.local');
      if (isIpOrLocal) {
        return `${window.location.protocol}//${hostname}:3001`;
      }
    }
  }
  return envUrl || 'http://127.0.0.1:3001';
};

export const PACS_API_BASE_URL = getDynamicPacsUrl().replace(/\/+$/, '');

export const apiClient = {
  async get(url: string) {
    const fullUrl = url.startsWith('http') ? url : `${PACS_API_BASE_URL}${url}`;
    const response = await fetch(fullUrl);
    if (!response.ok) {
      const err = await response.json().catch(() => ({ message: 'API Error' }));
      throw new Error(err.message || `GET Request failed: ${response.status}`);
    }
    return response.json();
  },

  async delete(url: string) {
    const fullUrl = url.startsWith('http') ? url : `${PACS_API_BASE_URL}${url}`;
    const response = await fetch(fullUrl, { method: 'DELETE' });
    if (!response.ok) {
      const err = await response.json().catch(() => ({ message: 'API Error' }));
      throw new Error(err.message || `DELETE Request failed: ${response.status}`);
    }
    return response.json();
  },

  async upload(url: string, files: File[]) {
    const formData = new FormData();
    files.forEach(file => {
      formData.append('files', file);
    });

    const fullUrl = url.startsWith('http') ? url : `${PACS_API_BASE_URL}${url}`;
    const response = await fetch(fullUrl, {
      method: 'POST',
      body: formData,
    });

    if (!response.ok) {
      const err = await response.json().catch(() => ({ message: 'API Error' }));
      throw new Error(err.message || `Upload failed: ${response.status}`);
    }
    return response.json();
  }
};
