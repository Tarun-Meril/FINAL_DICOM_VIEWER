import express from 'express';
import request from 'supertest';
import { CryptoTokenGenerator, ShortTokenGenerator } from '../tokenGenerator';
import { isValidPermissions } from '../permissions';
import { hashPassword, verifyPassword, ShareService, ShareServiceError } from '../service';
import { ShareRepository } from '../repository';
import shareRouter from '../routes';
import { db } from '../../../database/connection';

// -------------------------------------------------------------
// 1. Setup & Mocking
// -------------------------------------------------------------

// Add the mock study to the PACS database so validation passes
const VALID_STUDY_UID = '1.2.276.0.7230010.3.1.2.2155604110.4180.1021041295.1';
beforeAll(() => {
  db.addStudy({
    studyInstanceUid: VALID_STUDY_UID,
    patientName: 'Structured Reports',
    patientId: 'PID_SR',
  });
});

// Helper to construct a mock Supabase client for testing repository operations
function createMockSupabaseClient() {
  const queryBuilder: any = {
    select: jest.fn().mockReturnThis(),
    insert: jest.fn().mockReturnThis(),
    update: jest.fn().mockReturnThis(),
    delete: jest.fn().mockReturnThis(),
    eq: jest.fn().mockReturnThis(),
    or: jest.fn().mockReturnThis(),
    single: jest.fn().mockResolvedValue({ data: {}, error: null }),
    maybeSingle: jest.fn().mockResolvedValue({ data: {}, error: null }),
  };

  const client = {
    from: jest.fn(() => queryBuilder),
  };

  return { client, queryBuilder };
}

// -------------------------------------------------------------
// 2. Token Generation Tests
// -------------------------------------------------------------
describe('Token Generator', () => {
  test('CryptoTokenGenerator generates configured length hex token', () => {
    const gen = new CryptoTokenGenerator(32);
    const token = gen.generate();
    expect(token).toHaveLength(32);
    expect(/^[0-9a-f]+$/.test(token)).toBe(true);

    const gen16 = new CryptoTokenGenerator(16);
    expect(gen16.generate()).toHaveLength(16);
  });

  test('ShortTokenGenerator generates custom code with correct prefix and length', () => {
    const gen = new ShortTokenGenerator('MVP-', 6);
    const token = gen.generate();
    expect(token).toHaveLength(10); // 'MVP-' + 6 chars
    expect(token.startsWith('MVP-')).toBe(true);
  });
});

// -------------------------------------------------------------
// 3. Permission Validation Tests
// -------------------------------------------------------------
describe('Permissions Validation', () => {
  test('isValidPermissions accepts valid structures', () => {
    const valid = {
      view: true,
      measure: true,
      annotation: false,
      download: false,
    };
    expect(isValidPermissions(valid)).toBe(true);
  });

  test('isValidPermissions rejects missing keys, extra keys, and wrong types', () => {
    expect(isValidPermissions(null)).toBe(false);
    expect(isValidPermissions(undefined)).toBe(false);
    expect(isValidPermissions({})).toBe(false);
    expect(isValidPermissions({ view: true, measure: true, annotation: false })).toBe(false); // missing download
    expect(isValidPermissions({ view: true, measure: true, annotation: false, download: false, print: true })).toBe(false); // extra key
    expect(isValidPermissions({ view: 'yes', measure: true, annotation: false, download: false })).toBe(false); // string instead of bool
  });
});

// -------------------------------------------------------------
// 4. Password Utility Tests
// -------------------------------------------------------------
describe('Password Hashing', () => {
  test('hashes and successfully verifies correct password', () => {
    const password = 'MedViewSecurePass2026';
    const hash = hashPassword(password);
    expect(hash).toContain(':');
    expect(verifyPassword(password, hash)).toBe(true);
    expect(verifyPassword('WrongPass', hash)).toBe(false);
  });
});

// -------------------------------------------------------------
// 5. Share Service & Expiration Tests (Unit Business Logic)
// -------------------------------------------------------------
describe('Share Service & Business Logic', () => {
  let mockSupabase: any;
  let queryBuilder: any;
  let customRepo: ShareRepository;
  let service: ShareService;

  beforeEach(() => {
    const setup = createMockSupabaseClient();
    mockSupabase = setup.client;
    queryBuilder = setup.queryBuilder;
    customRepo = new ShareRepository(mockSupabase);
    service = new ShareService(customRepo);
  });

  test('createShare throws error if study does not exist in local PACS', async () => {
    await expect(
      service.createShare({
        studyUid: 'non-existent-uid',
        permissions: { view: true, measure: false, annotation: false, download: false },
      })
    ).rejects.toThrow(ShareServiceError);
  });

  test('createShare throws error if expiration date is in the past', async () => {
    const pastDate = new Date(Date.now() - 3600 * 1000).toISOString();
    await expect(
      service.createShare({
        studyUid: VALID_STUDY_UID,
        permissions: { view: true, measure: false, annotation: false, download: false },
        expiresAt: pastDate,
      })
    ).rejects.toThrow(ShareServiceError);
  });

  test('createShare generates a secure link successfully on correct inputs', async () => {
    const mockDbResult = {
      token: 'mock-generated-token-hash-12345',
      study_uid: VALID_STUDY_UID,
      sharing_scope: 'STUDY',
      permissions: { view: true, measure: true, annotation: false, download: false },
      expires_at: null,
      password_hash: null,
      created_by: 'doctor-a',
      revoked: false,
    };

    queryBuilder.single.mockResolvedValue({ data: mockDbResult, error: null });

    const result = await service.createShare({
      studyUid: VALID_STUDY_UID,
      permissions: { view: true, measure: true, annotation: false, download: false },
      createdBy: 'doctor-a',
    });

    expect(result.token).toBeDefined();
    expect(result.study_uid).toBe(VALID_STUDY_UID);
    expect(mockSupabase.from).toHaveBeenCalledWith('share_links');
  });

  test('validateShare returns passwordRequired: true when password is set but not provided', async () => {
    const mockDbResult = {
      token: 'pwd-token',
      study_uid: VALID_STUDY_UID,
      permissions: { view: true, measure: true, annotation: false, download: false },
      password_hash: hashPassword('password123'),
      expires_at: null,
      revoked: false,
    };

    queryBuilder.maybeSingle.mockResolvedValue({ data: mockDbResult, error: null });

    const result = await service.validateShare('pwd-token');
    expect(result.passwordRequired).toBe(true);
    expect(result.studyUid).toBeUndefined();
  });

  test('validateShare returns study details when correct password is provided', async () => {
    const rawPassword = 'password123';
    const mockDbResult = {
      token: 'pwd-token',
      study_uid: VALID_STUDY_UID,
      permissions: { view: true, measure: true, annotation: false, download: false },
      password_hash: hashPassword(rawPassword),
      expires_at: null,
      revoked: false,
    };

    queryBuilder.maybeSingle.mockResolvedValue({ data: mockDbResult, error: null });
    queryBuilder.single.mockResolvedValue({ data: mockDbResult, error: null }); // For updating last_accessed

    const result = await service.validateShare('pwd-token', rawPassword);
    expect(result.passwordRequired).toBe(false);
    expect(result.studyUid).toBe(VALID_STUDY_UID);
  });

  test('validateShare throws error when link is revoked', async () => {
    const mockDbResult = {
      token: 'revoked-token',
      study_uid: VALID_STUDY_UID,
      revoked: true,
    };

    queryBuilder.maybeSingle.mockResolvedValue({ data: mockDbResult, error: null });

    await expect(service.validateShare('revoked-token')).rejects.toThrow('Share link has been revoked');
  });

  test('validateShare throws error when link has expired', async () => {
    const mockDbResult = {
      token: 'expired-token',
      study_uid: VALID_STUDY_UID,
      expires_at: new Date(Date.now() - 1000).toISOString(), // Expired 1 second ago
      revoked: false,
    };

    queryBuilder.maybeSingle.mockResolvedValue({ data: mockDbResult, error: null });

    await expect(service.validateShare('expired-token')).rejects.toThrow('Share link has expired');
  });

  test('validateShare handles Supabase offline/error states', async () => {
    queryBuilder.maybeSingle.mockResolvedValue({ data: null, error: { message: 'Connection timed out' } });

    await expect(service.validateShare('some-token')).rejects.toThrow('Connection timed out');
  });
});

// -------------------------------------------------------------
// 6. API Route Integration Tests (using Express & Supertest)
// -------------------------------------------------------------
describe('Share Study API Endpoint Routing', () => {
  let mockSupabase: any;
  let queryBuilder: any;
  let customRepo: ShareRepository;
  let service: ShareService;
  let app: express.Express;

  beforeEach(() => {
    const setup = createMockSupabaseClient();
    mockSupabase = setup.client;
    queryBuilder = setup.queryBuilder;
    customRepo = new ShareRepository(mockSupabase);
    service = new ShareService(customRepo);

    // Create Express wrapper app and mount routes injected with mock dependencies
    app = express();
    app.use(express.json());
    
    // Inject custom controller routes
    const { ShareController } = require('../controller');
    const controller = new ShareController(service);
    
    const router = express.Router();
    const { validateCreateShare, validateUpdateShare, validateTokenParam } = require('../validator');

    router.post('/share-study', validateCreateShare, controller.createShareLink);
    router.get('/share/list', controller.listShareLinks);
    router.get('/share/:token', validateTokenParam, controller.validateShareToken);
    router.patch('/share/:token', validateUpdateShare, controller.updateShareLink);
    router.delete('/share/:token', validateTokenParam, controller.revokeShareLink);

    app.use('/api', router);
  });

  test('POST /api/share-study returns 400 for empty request', async () => {
    const res = await request(app).post('/api/share-study').send({});
    expect(res.status).toBe(400);
    expect(res.body.error).toContain('Request body is empty');
  });

  test('POST /api/share-study returns 400 for missing study_uid', async () => {
    const res = await request(app)
      .post('/api/share-study')
      .send({ permissions: { view: true, measure: true, annotation: false, download: false } });
    expect(res.status).toBe(400);
    expect(res.body.error).toContain('Missing or invalid study_uid');
  });

  test('POST /api/share-study returns 400 for malformed permissions', async () => {
    const res = await request(app)
      .post('/api/share-study')
      .send({ study_uid: VALID_STUDY_UID, permissions: { view: 'yes' } });
    expect(res.status).toBe(400);
    expect(res.body.error).toContain('Malformed permission object');
  });

  test('POST /api/share-study returns 201 on success', async () => {
    const mockDbResult = {
      token: 'successful-api-token-1234',
      study_uid: VALID_STUDY_UID,
      sharing_scope: 'STUDY',
      permissions: { view: true, measure: true, annotation: false, download: false },
      expires_at: null,
      password_hash: null,
      created_by: 'test-user',
      revoked: false,
    };

    queryBuilder.single.mockResolvedValue({ data: mockDbResult, error: null });

    const res = await request(app)
      .post('/api/share-study')
      .send({
        study_uid: VALID_STUDY_UID,
        permissions: { view: true, measure: true, annotation: false, download: false },
      });

    expect(res.status).toBe(201);
    expect(res.body.token).toBe('successful-api-token-1234');
    expect(res.body.study_uid).toBe(VALID_STUDY_UID);
  });

  test('GET /api/share/:token returns 401 and flags password requirements', async () => {
    const mockDbResult = {
      token: 'pwd-api-token',
      study_uid: VALID_STUDY_UID,
      permissions: { view: true, measure: true, annotation: false, download: false },
      password_hash: hashPassword('secret'),
      expires_at: null,
      revoked: false,
    };

    queryBuilder.maybeSingle.mockResolvedValue({ data: mockDbResult, error: null });

    const res = await request(app).get('/api/share/pwd-api-token');
    expect(res.status).toBe(401);
    expect(res.body.passwordRequired).toBe(true);
  });

  test('GET /api/share/:token validates successfully with correct password', async () => {
    const mockDbResult = {
      token: 'pwd-api-token-2',
      study_uid: VALID_STUDY_UID,
      permissions: { view: true, measure: true, annotation: false, download: false },
      password_hash: hashPassword('secret'),
      expires_at: null,
      revoked: false,
    };

    queryBuilder.maybeSingle.mockResolvedValue({ data: mockDbResult, error: null });
    queryBuilder.single.mockResolvedValue({ data: mockDbResult, error: null });

    const res = await request(app)
      .get('/api/share/pwd-api-token-2')
      .query({ password: 'secret' });
    
    expect(res.status).toBe(200);
    expect(res.body.study_uid).toBe(VALID_STUDY_UID);
  });
});
