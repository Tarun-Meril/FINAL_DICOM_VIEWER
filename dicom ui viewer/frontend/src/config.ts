export const getDynamicApiBaseUrl = (): string => {
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
  return (import.meta.env.VITE_API_BASE_URL || 'http://127.0.0.1:8000').replace(/\/+$/, '');
};

export const API_BASE_URL = getDynamicApiBaseUrl();
