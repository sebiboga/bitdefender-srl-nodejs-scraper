import { jest } from '@jest/globals';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import fetch from 'node-fetch';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, '../../.env.local') });

const HAS_SOLR = !!process.env.SOLR_AUTH;

function itIfSolr(name, fn, timeout) {
  if (HAS_SOLR) {
    return it(name, fn, timeout);
  }
  return it.skip(`${name} (skipped: SOLR_AUTH not set)`, fn, timeout);
}

beforeAll(() => {
  if (HAS_SOLR) {
    process.env.SOLR_AUTH = process.env.SOLR_AUTH;
  }
});

const TEST_CIF = '18189442';
const TEST_BRAND = 'BITDEFENDER';
const CSOD_SPA_URL = 'https://bitdefender.csod.com/ux/ats/careersite/1/home?c=bitdefender';

const ROMANIAN_CITIES = ['Bucharest', 'București', 'Cluj-Napoca', 'Timișoara', 'Iași', 'Brașov', 'Constanța', 'Sibiu', 'Oradea'];

describe('E2E: Full Scraping Pipeline', () => {

  describe('CSOD Careers API — Token Extraction', () => {
    let token;

    beforeAll(async () => {
      const res = await fetch(CSOD_SPA_URL, {
        headers: {
          'User-Agent': 'job_seeker_ro_spider',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
        }
      });
      const html = await res.text();
      const match = html.match(/csod\.context\s*=\s*({.*?});/);
      if (match) {
        const context = JSON.parse(match[1]);
        token = context.token;
      }
    }, 15000);

    it('should extract a valid token from the CSOD SPA', () => {
      expect(token).toBeDefined();
      expect(typeof token).toBe('string');
      expect(token.length).toBeGreaterThan(100);
    });

    it('should have a parsable JWT token', () => {
      const parts = token.split('.');
      expect(parts.length).toBe(3);
      const payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString());
      expect(payload).toHaveProperty('corp', 'bitdefender');
      expect(payload).toHaveProperty('sub', -100);
    });
  });

  describe('CSOD Careers API — Real Data Fetch', () => {
    let apiData;

    beforeAll(async () => {
      const spaRes = await fetch(CSOD_SPA_URL, {
        headers: {
          'User-Agent': 'job_seeker_ro_spider',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
        }
      });
      const html = await spaRes.text();
      const match = html.match(/csod\.context\s*=\s*({.*?});/);
      const context = JSON.parse(match[1]);
      const token = context.token;

      const apiRes = await fetch('https://eu-fra.api.csod.com/rec-job-search/external/jobs', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
          'User-Agent': 'job_seeker_ro_spider',
          'Origin': 'https://bitdefender.csod.com',
          'Accept': 'application/json'
        },
        body: JSON.stringify({
          careerSiteId: 1,
          careerSitePageId: 1,
          pageNumber: 1,
          pageSize: 25,
          cultureId: 2,
          searchText: "",
          cultureName: "en-GB",
          states: [],
          countryCodes: [],
          cities: [],
          radius: null,
          postingsWithinDays: null,
          customFieldCheckboxKeys: [],
          customFieldDropdowns: [],
          customFieldRadios: []
        })
      });
      apiData = await apiRes.json();
    }, 30000);

    it('should respond with valid job data from CSOD API', () => {
      expect(apiData).toHaveProperty('status', 'Success');
      expect(apiData).toHaveProperty('data');
      expect(apiData.data).toHaveProperty('requisitions');
      expect(Array.isArray(apiData.data.requisitions)).toBe(true);
      expect(apiData.data.requisitions.length).toBeGreaterThan(0);
      expect(apiData.data).toHaveProperty('totalCount');
      expect(typeof apiData.data.totalCount).toBe('number');
    }, 10000);

    it('should have Romania jobs with expected fields', () => {
      const job = apiData.data.requisitions[0];
      expect(job).toHaveProperty('requisitionId');
      expect(job).toHaveProperty('displayJobTitle');
      expect(typeof job.displayJobTitle).toBe('string');
      expect(job).toHaveProperty('locations');
      expect(Array.isArray(job.locations)).toBe(true);
    });

    it('should have some jobs in Romania', () => {
      const roJobs = apiData.data.requisitions.filter(r =>
        (r.locations || []).some(l => l.country === 'RO')
      );
      expect(roJobs.length).toBeGreaterThan(0);
    });
  });

  describe('Parse + Transform Pipeline', () => {
    let index;
    let apiData;

    beforeAll(async () => {
      index = await import('../../index.js');

      const spaRes = await fetch(CSOD_SPA_URL, {
        headers: {
          'User-Agent': 'job_seeker_ro_spider',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
        }
      });
      const html = await spaRes.text();
      const match = html.match(/csod\.context\s*=\s*({.*?});/);
      const context = JSON.parse(match[1]);
      const token = context.token;

      const apiRes = await fetch('https://eu-fra.api.csod.com/rec-job-search/external/jobs', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
          'User-Agent': 'job_seeker_ro_spider',
          'Origin': 'https://bitdefender.csod.com',
          'Accept': 'application/json'
        },
        body: JSON.stringify({
          careerSiteId: 1,
          careerSitePageId: 1,
          pageNumber: 1,
          pageSize: 10,
          cultureId: 2,
          searchText: "",
          cultureName: "en-GB",
          states: [],
          countryCodes: [],
          cities: [],
          radius: null,
          postingsWithinDays: null,
          customFieldCheckboxKeys: [],
          customFieldDropdowns: [],
          customFieldRadios: []
        })
      });
      apiData = await apiRes.json();
    }, 30000);

    it('should parse real CSOD API response into standardized format', () => {
      const result = index.parseApiJobs(apiData);

      expect(result).toHaveProperty('jobs');
      expect(result).toHaveProperty('total');
      expect(result.jobs.length).toBeGreaterThan(0);

      const parsed = result.jobs[0];
      expect(parsed).toHaveProperty('url');
      expect(parsed.url).toContain('bitdefender.csod.com');
      expect(parsed).toHaveProperty('title');
      expect(parsed).toHaveProperty('countryCodes');
    });

    it('should map parsed jobs to job model', () => {
      const parsed = index.parseApiJobs(apiData);
      const model = index.mapToJobModel(parsed.jobs[0], TEST_CIF);

      expect(model).toHaveProperty('url');
      expect(model).toHaveProperty('title');
      expect(model).toHaveProperty('company');
      expect(model).toHaveProperty('cif', TEST_CIF);
      expect(model).toHaveProperty('status', 'scraped');
      expect(model).toHaveProperty('date');
      expect(model.url).toContain('bitdefender.csod.com');
    });

    it('should produce valid job URLs that are accessible', async () => {
      const parsed = index.parseApiJobs(apiData);

      for (const job of parsed.jobs.slice(0, 2)) {
        const res = await fetch(job.url, {
          method: 'HEAD',
          headers: { 'User-Agent': 'job_seeker_ro_spider' }
        });
        expect(res.ok).toBe(true);
      }
    }, 30000);
  });

  describe('Company Validation Path', () => {
    let anaf;
    let company;

    beforeAll(async () => {
      anaf = await import('../../src/anaf.js');
      company = await import('../../company.js');
    });

    it('should find BITDEFENDER in ANAF and validate active status', async () => {
      const results = await anaf.searchCompany(TEST_BRAND);

      const bd = results.find(c =>
        c.name.toUpperCase().startsWith(TEST_BRAND + ' ') &&
        c.statusLabel === 'Funcțiune'
      );
      expect(bd).toBeDefined();
      expect(bd.cui.toString()).toBe(TEST_CIF);

      const anafData = await anaf.getCompanyFromANAF(TEST_CIF);
      expect(anafData).toBeDefined();
      expect(anafData.inactive).toBe(false);
    }, 30000);

    itIfSolr('should run full validation and report active status with job count', async () => {
      const result = await company.validateAndGetCompany();

      expect(result.status).toBe('active');
      expect(result.company).toBe('BITDEFENDER SRL');
      expect(result.cif).toBe(TEST_CIF);
      expect(result.existingJobsCount).toBeGreaterThan(0);
    }, 30000);
  });

  describe('SOLR Data Verification', () => {
    let solr;

    beforeAll(async () => {
      solr = await import('../../solr.js');
    });

    itIfSolr('should have BITDEFENDER jobs in SOLR with correct company name', async () => {
      const result = await solr.querySOLR(TEST_CIF);

      expect(result.numFound).toBeGreaterThan(0);

      for (const job of result.docs) {
        expect(job.company).toBe('BITDEFENDER SRL');
        expect(job.cif).toBe(TEST_CIF);
      }
    }, 15000);

    itIfSolr('should have BITDEFENDER company core entry with required fields', async () => {
      const result = await solr.queryCompanySOLR(`id:${TEST_CIF}`);

      expect(result.numFound).toBe(1);
      const bd = result.docs[0];
      expect(bd.company).toBe('BITDEFENDER SRL');
      expect(bd.status).toBe('activ');
    }, 15000);
  });
});
