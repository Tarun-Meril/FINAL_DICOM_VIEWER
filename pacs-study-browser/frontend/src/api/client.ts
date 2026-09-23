const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || '';

export const apiClient = {
  async get(url: string) {
    const response = await fetch(`${API_BASE_URL}${url}`);
    if (!response.ok) {
      const err = await response.json().catch(() => ({ message: 'API Error' }));
      throw new Error(err.message || `GET Request failed: ${response.status}`);
    }
    return response.json();
  },

  async delete(url: string) {
    const response = await fetch(`${API_BASE_URL}${url}`, { method: 'DELETE' });
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

    const response = await fetch(`${API_BASE_URL}${url}`, {
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
