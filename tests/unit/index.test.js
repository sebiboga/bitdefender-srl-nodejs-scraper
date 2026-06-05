import { jest } from '@jest/globals';

describe('index.js Component Tests', () => {
  let index;

  beforeAll(async () => {
    index = await import('../../index.js');
  });

  describe('parseApiJobs', () => {
    it('should parse CSOD API response format', () => {
      const apiData = {
        status: "Success",
        data: {
          totalCount: 40,
          requisitions: [
            {
              requisitionId: 945,
              displayJobTitle: "QA Engineer",
              postingEffectiveDate: "01/06/2026",
              locations: [
                { city: "Bucharest", country: "RO" }
              ]
            }
          ]
        }
      };

      const result = index.parseApiJobs(apiData);

      expect(result.jobs).toHaveLength(1);
      expect(result.jobs[0].title).toBe("QA Engineer");
      expect(result.jobs[0].url).toContain("requisition/945");
      expect(result.jobs[0].location).toEqual(["Bucharest"]);
      expect(result.jobs[0].countryCodes).toEqual(["RO"]);
    });

    it('should handle empty job list', () => {
      const apiData = {
        status: "Success",
        data: { totalCount: 0, requisitions: [] }
      };

      const result = index.parseApiJobs(apiData);

      expect(result.jobs).toEqual([]);
      expect(result.total).toBe(0);
    });

    it('should handle missing data field', () => {
      const result = index.parseApiJobs({});

      expect(result.jobs).toEqual([]);
      expect(result.total).toBe(0);
    });

    it('should handle multiple locations', () => {
      const apiData = {
        status: "Success",
        data: {
          totalCount: 1,
          requisitions: [
            {
              requisitionId: 123,
              displayJobTitle: "Developer",
              postingEffectiveDate: "01/06/2026",
              locations: [
                { city: "Bucharest", country: "RO" },
                { city: "Cluj-Napoca", country: "RO" }
              ]
            }
          ]
        }
      };

      const result = index.parseApiJobs(apiData);

      expect(result.jobs[0].location).toEqual(["Bucharest", "Cluj-Napoca"]);
    });

    it('should handle non-RO country codes', () => {
      const apiData = {
        status: "Success",
        data: {
          totalCount: 1,
          requisitions: [
            {
              requisitionId: 456,
              displayJobTitle: "Remote Job",
              postingEffectiveDate: "01/06/2026",
              locations: [
                { city: "Paris", country: "FR" }
              ]
            }
          ]
        }
      };

      const result = index.parseApiJobs(apiData);

      expect(result.jobs[0].location).toEqual(["Paris, FR"]);
      expect(result.jobs[0].countryCodes).toEqual(["FR"]);
    });
  });

  describe('mapToJobModel', () => {
    const COMPANY_NAME = 'BITDEFENDER SRL';
    const COMPANY_CIF = '18189442';

    it('should map raw job to job model format', () => {
      const rawJob = {
        url: 'https://bitdefender.csod.com/ux/ats/careersite/1/home/requisition/945?c=bitdefender',
        title: 'QA Engineer',
        location: ['Bucharest']
      };

      const result = index.mapToJobModel(rawJob, COMPANY_CIF, COMPANY_NAME);

      expect(result.url).toBe(rawJob.url);
      expect(result.title).toBe(rawJob.title);
      expect(result.company).toBe(COMPANY_NAME);
      expect(result.cif).toBe(COMPANY_CIF);
      expect(result.location).toEqual(rawJob.location);
      expect(result.status).toBe('scraped');
      expect(result.date).toBeDefined();
    });

    it('should remove undefined fields', () => {
      const rawJob = {
        url: 'https://bitdefender.csod.com/ux/ats/careersite/1/home/requisition/945?c=bitdefender',
        title: 'Job 1'
      };

      const result = index.mapToJobModel(rawJob, COMPANY_CIF);

      expect(result.location).toBeUndefined();
    });

    it('should handle missing title', () => {
      const rawJob = { url: 'https://bitdefender.csod.com/ux/ats/careersite/1/home/requisition/945?c=bitdefender' };

      const result = index.mapToJobModel(rawJob, COMPANY_CIF);

      expect(result.title).toBeUndefined();
      expect(result.url).toBe('https://bitdefender.csod.com/ux/ats/careersite/1/home/requisition/945?c=bitdefender');
    });
  });
});
