export interface SharePermissions {
  view: boolean;
  measure: boolean;
  annotation: boolean;
  download: boolean;
}

/**
 * Default standard permissions for sharing a study.
 */
export const DEFAULT_PERMISSIONS: SharePermissions = {
  view: true,
  measure: true,
  annotation: false,
  download: false
};

/**
 * Strictly validates if an object matches the SharePermissions shape.
 * Rejects missing fields, extra fields, or invalid types.
 */
export function isValidPermissions(permissions: any): permissions is SharePermissions {
  if (typeof permissions !== 'object' || permissions === null) {
    return false;
  }

  const requiredKeys = ['view', 'measure', 'annotation', 'download'];
  const keys = Object.keys(permissions);

  // Must contain exactly the required keys
  if (keys.length !== requiredKeys.length) {
    return false;
  }

  for (const key of requiredKeys) {
    if (!(key in permissions) || typeof permissions[key] !== 'boolean') {
      return false;
    }
  }

  return true;
}
