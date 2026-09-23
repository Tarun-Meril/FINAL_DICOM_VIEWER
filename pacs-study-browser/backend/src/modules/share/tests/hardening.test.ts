import express from 'express';
import request from 'supertest';
import { securityHeaders, rateLimiter } from '../../../middleware/security';
import { HealthController } from '../../../controllers/healthController';
import { BackupController } from '../../../controllers/backupController';

// Mock Supabase client to prevent actual network requests during unit tests
jest.mock('../supabase', () => ({
  supabase: {
    from: jest.fn(() => ({
      select: jest.fn(() => ({
        limit: jest.fn().mockResolvedValue({ data: [], error: null })
      }))
    }))
  }
}));

describe('Production Hardening & Diagnostics Tests', () => {
  // Test Security Headers
  test('Security Headers are injected correctly', async () => {
    const app = express();
    app.use(securityHeaders);
    app.get('/test-headers', (req, res) => res.sendStatus(200));

    const res = await request(app).get('/test-headers');
    expect(res.headers['x-content-type-options']).toBe('nosniff');
    expect(res.headers['x-frame-options']).toBe('DENY');
    expect(res.headers['x-xss-protection']).toBe('1; mode=block');
    expect(res.headers['content-security-policy']).toContain('default-src');
  });

  // Test Rate Limiter
  test('Rate Limiter blocks excess requests with 429', async () => {
    const app = express();
    // Allow max 2 requests inside window
    app.use(rateLimiter(2, 5000));
    app.get('/test-rate-limit', (req, res) => res.sendStatus(200));

    const res1 = await request(app).get('/test-rate-limit');
    expect(res1.status).toBe(200);

    const res2 = await request(app).get('/test-rate-limit');
    expect(res2.status).toBe(200);

    const res3 = await request(app).get('/test-rate-limit');
    expect(res3.status).toBe(429);
    expect(res3.body.error).toContain('Too many requests');
  });

  // Test Health Diagnostics schema
  test('Health Endpoint diagnostics returns system details', async () => {
    const app = express();
    app.get('/api/health', HealthController.checkHealth);

    const res = await request(app).get('/api/health');
    // Note: status might be 500 or 200 depending on Supabase mock state, but verify JSON structure
    expect(res.body).toHaveProperty('status');
    expect(res.body).toHaveProperty('version');
    expect(res.body).toHaveProperty('uptime');
    expect(res.body).toHaveProperty('database');
    expect(res.body).toHaveProperty('supabase');
    expect(res.body).toHaveProperty('storage');
    expect(res.body).toHaveProperty('metrics');
  });

  // Test Backup Validator
  test('Backup verification rejects malformed schemas', async () => {
    const app = express();
    app.use(express.json());
    app.post('/api/admin/verify-backup', BackupController.verifyBackup);

    // Empty payload
    const resEmpty = await request(app).post('/api/admin/verify-backup').send({});
    expect(resEmpty.body.valid).toBe(false);
    expect(resEmpty.body.reasons).toContain('Missing or invalid share_links array');

    // Valid structure payload
    const resValid = await request(app)
      .post('/api/admin/verify-backup')
      .send({
        share_links: [],
        share_audit_logs: []
      });
    expect(resValid.body.valid).toBe(true);
    expect(resValid.body.info.linksCount).toBe(0);
  });
});
