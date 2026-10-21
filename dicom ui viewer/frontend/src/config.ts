export const getDynamicApiBaseUrl = (): string => {
  if (typeof window !== 'undefined' && window.location) {
    let apiHost = new URLSearchParams(window.location.search).get('apiHost');

    // Also check inside hash if present (e.g. #/viewer/uid?apiHost=...)
    if (!apiHost && window.location.hash && window.location.hash.includes('?')) {
      const hashQuery = window.location.hash.split('?')[1];
      apiHost = new URLSearchParams(hashQuery).get('apiHost');
    }

    // Persist in localStorage so subsequent navigation (MPR, VR, Series) remembers the host
    if (apiHost) {
      const cleanHost = apiHost.replace(/\/+$/, '');
      try {
        localStorage.setItem('merilview_api_host', cleanHost);
        localStorage.setItem('merilview_cloudflare_tunnel_url', cleanHost);
      } catch (e) {}
      return cleanHost;
    }

    // Check previously saved host from localStorage
    try {
      const savedHost = localStorage.getItem('merilview_api_host') || localStorage.getItem('merilview_cloudflare_tunnel_url');
      if (savedHost) return savedHost.replace(/\/+$/, '');
    } catch (e) {}

    const hostname = window.location.hostname;
    const port = window.location.port;
    const protocol = window.location.protocol;

    // Electron desktop environment (app://, file://) or embedded electronAPI
    const isElectron = protocol === 'app:' || protocol === 'file:' || !!(window as any).electronAPI;
    if (isElectron) {
      return 'http://127.0.0.1:3001';
    }

    // If served directly from port 3001 (Node PACS backend)
    if (port === '3001') {
      return `${protocol}//${hostname}:3001`;
    }

    if (hostname && hostname !== 'localhost' && hostname !== '127.0.0.1') {
      const isIpOrLocal = /^(\d{1,3}\.){3}\d{1,3}$/.test(hostname) || hostname.endsWith('.local');
      if (isIpOrLocal) {
        return `${protocol}//${hostname}:3001`;
      }
      return (
        import.meta.env.VITE_CLOUDFLARE_TUNNEL_URL ||
        import.meta.env.VITE_API_BASE_URL ||
        window.location.origin
      ).replace(/\/+$/, '');
    }
  }
  return (
    import.meta.env.VITE_CLOUDFLARE_TUNNEL_URL ||
    import.meta.env.VITE_API_BASE_URL ||
    'http://127.0.0.1:3001'
  ).replace(/\/+$/, '');
};

export const API_BASE_URL = getDynamicApiBaseUrl();

export function setApiHost(host: string): void {
  if (typeof localStorage !== 'undefined' && host) {
    const clean = host.trim().replace(/\/+$/, '');
    localStorage.setItem('merilview_api_host', clean);
    localStorage.setItem('merilview_cloudflare_tunnel_url', clean);
  }
}

export function getSavedApiHost(): string {
  if (typeof localStorage !== 'undefined') {
    return localStorage.getItem('merilview_api_host') || localStorage.getItem('merilview_cloudflare_tunnel_url') || '';
  }
  return '';
}
