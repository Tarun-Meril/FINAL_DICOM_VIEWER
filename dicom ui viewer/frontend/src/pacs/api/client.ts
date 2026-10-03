export const PACS_API_BASE_URL = (
  import.meta.env.VITE_PACS_API_BASE_URL || 
  import.meta.env.VITE_SHARE_API_BASE_URL || 
  'http://127.0.0.1:3001'
).replace(/\/+$/, '');

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
