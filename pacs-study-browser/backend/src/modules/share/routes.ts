import { Router } from 'express';
import { defaultShareController } from './controller';
import { validateCreateShare, validateUpdateShare, validateTokenParam } from './validator';

const router = Router();

// POST /api/share-study
// Purpose: Generate a share link.
router.post('/share-study', validateCreateShare, defaultShareController.createShareLink);

// GET /api/share/list
// Purpose: List active links.
// Note: Declared before /share/:token to prevent collision.
router.get('/share/list', defaultShareController.listShareLinks);

// GET /api/share/:token
// Purpose: Validate token.
router.get('/share/:token', validateTokenParam, defaultShareController.validateShareToken);

// GET /api/share/:token/audit
// Purpose: Retrieve audit log history.
router.get('/share/:token/audit', validateTokenParam, defaultShareController.getShareAuditHistory);

// PATCH /api/share/:token
// Purpose: Update Expiration/Permissions.
router.patch('/share/:token', validateUpdateShare, defaultShareController.updateShareLink);

// DELETE /api/share/:token
// Purpose: Revoke share link.
router.delete('/share/:token', validateTokenParam, defaultShareController.revokeShareLink);

export default router;
