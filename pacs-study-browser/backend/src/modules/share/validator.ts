import { Request, Response, NextFunction } from 'express';
import { isValidPermissions } from './permissions';

/**
 * Validates request payload for POST /api/share-study
 */
export function validateCreateShare(req: Request, res: Response, next: NextFunction) {
  const { study_uid, permissions, expires_at, password } = req.body;

  // Reject empty request
  if (!req.body || Object.keys(req.body).length === 0) {
    return res.status(400).json({ error: 'Request body is empty' });
  }

  // Reject missing Study UID
  if (!study_uid || typeof study_uid !== 'string' || study_uid.trim() === '') {
    return res.status(400).json({ error: 'Missing or invalid study_uid' });
  }

  // Reject missing or malformed Permission Object
  if (!permissions) {
    return res.status(400).json({ error: 'Missing permissions object' });
  }
  if (!isValidPermissions(permissions)) {
    return res.status(400).json({
      error: 'Malformed permission object. Must contain boolean values for view, measure, annotation, and download.',
    });
  }

  // Reject invalid expiration date
  if (expires_at) {
    const expiry = new Date(expires_at);
    if (isNaN(expiry.getTime())) {
      return res.status(400).json({ error: 'Invalid expires_at date format' });
    }
    if (expiry.getTime() <= Date.now()) {
      return res.status(400).json({ error: 'expires_at must be a future timestamp' });
    }
  }

  // Validate optional password
  if (password !== undefined && (typeof password !== 'string' || password.length === 0)) {
    return res.status(400).json({ error: 'Password must be a non-empty string' });
  }

  next();
}

/**
 * Validates request payload for PATCH /api/share/:token
 */
export function validateUpdateShare(req: Request, res: Response, next: NextFunction) {
  const { permissions, expires_at, password } = req.body;
  const { token } = req.params;

  if (!token || typeof token !== 'string' || token.trim() === '') {
    return res.status(400).json({ error: 'Token parameter is required' });
  }

  // Reject empty request
  if (permissions === undefined && expires_at === undefined && password === undefined) {
    return res.status(400).json({ error: 'At least one field (permissions, expires_at, or password) must be provided for update' });
  }

  // Validate permissions if provided
  if (permissions !== undefined && !isValidPermissions(permissions)) {
    return res.status(400).json({
      error: 'Malformed permission object. Must contain boolean values for view, measure, annotation, and download.',
    });
  }

  // Validate expiration if provided
  if (expires_at !== undefined && expires_at !== null) {
    const expiry = new Date(expires_at);
    if (isNaN(expiry.getTime())) {
      return res.status(400).json({ error: 'Invalid expires_at date format' });
    }
  }

  // Validate optional password
  if (password !== undefined && password !== null && (typeof password !== 'string' || password.length === 0)) {
    return res.status(400).json({ error: 'Password must be a non-empty string or null' });
  }

  next();
}

/**
 * Validates token presence in params
 */
export function validateTokenParam(req: Request, res: Response, next: NextFunction) {
  const { token } = req.params;

  if (!token || typeof token !== 'string' || token.trim() === '') {
    return res.status(400).json({ error: 'Share token is required' });
  }

  next();
}
