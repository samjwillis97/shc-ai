import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { MockHttpBinServer } from '../helpers/mockHttpBinServer';
import axios from 'axios';

describe('MockHttpBinServer', () => {
  let server: MockHttpBinServer;
  let baseUrl: string;

  beforeAll(async () => {
    server = new MockHttpBinServer();
    const port = await server.start(0);
    baseUrl = `http://localhost:${port}`;
  });

  afterAll(async () => {
    await server.stop();
  });

  describe('GET /get', () => {
    it('should return request metadata', async () => {
      const response = await axios.get(`${baseUrl}/get`, {
        headers: { 'X-Test': 'test-value' },
        params: { param1: 'value1', param2: 'value2' }
      });

      expect(response.status).toBe(200);
      const data = response.data as any;
      expect(data).toHaveProperty('method', 'GET');
      expect(data).toHaveProperty('url');
      expect(data).toHaveProperty('headers');
      expect(data).toHaveProperty('args');
      expect(data.headers).toHaveProperty('x-test', 'test-value');
      expect(data.args).toEqual({ param1: 'value1', param2: 'value2' });
    });
  });

  describe('POST /post', () => {
    it('should return request metadata with body data', async () => {
      const postData = { message: 'Hello', userId: 123 };
      const response = await axios.post(`${baseUrl}/post`, postData, {
        headers: { 'Content-Type': 'application/json' }
      });

      expect(response.status).toBe(200);
      const data = response.data as any;
      expect(data).toHaveProperty('method', 'POST');
      expect(data).toHaveProperty('json');
      expect(data.json).toEqual(postData);
    });

    it('should handle form data', async () => {
      const formData = new URLSearchParams();
      formData.append('name', 'John');
      formData.append('age', '30');

      const response = await axios.post(`${baseUrl}/post`, formData, {
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
      });

      expect(response.status).toBe(200);
      const data = response.data as any;
      expect(data).toHaveProperty('form');
      expect(data.form).toEqual({ name: 'John', age: '30' });
    });
  });

  describe('GET /headers', () => {
    it('should return request headers', async () => {
      const response = await axios.get(`${baseUrl}/headers`, {
        headers: { 
          'Authorization': 'Bearer token123',
          'X-Custom': 'custom-value'
        }
      });

      expect(response.status).toBe(200);
      const data = response.data as any;
      expect(data).toHaveProperty('headers');
      expect(data.headers).toHaveProperty('authorization', 'Bearer token123');
      expect(data.headers).toHaveProperty('x-custom', 'custom-value');
    });
  });

  describe('GET /json', () => {
    it('should return slideshow JSON data', async () => {
      const response = await axios.get(`${baseUrl}/json`);

      expect(response.status).toBe(200);
      const data = response.data as any;
      expect(data).toHaveProperty('slideshow');
      expect(data.slideshow).toHaveProperty('title', 'Sample Slide Show');
      expect(data.slideshow).toHaveProperty('author', 'Yours Truly');
      expect(data.slideshow).toHaveProperty('date', 'date of publication');
      expect(data.slideshow).toHaveProperty('slides');
      expect(Array.isArray(data.slideshow.slides)).toBe(true);
    });
  });

  describe('GET /status/{code}', () => {
    it('should return specified status code', async () => {
      try {
        await axios.get(`${baseUrl}/status/404`);
        expect.fail('Should have thrown an error');
      } catch (error: any) {
        expect(error.response?.status).toBe(404);
      }
    });

    it('should return 500 status code', async () => {
      try {
        await axios.get(`${baseUrl}/status/500`);
        expect.fail('Should have thrown an error');
      } catch (error: any) {
        expect(error.response?.status).toBe(500);
      }
    });

    it('should return 200 status code', async () => {
      const response = await axios.get(`${baseUrl}/status/200`);
      expect(response.status).toBe(200);
    });
  });

  describe('PUT /put', () => {
    it('should return request metadata with body data', async () => {
      const putData = { update: 'data', id: 456 };
      const response = await axios.put(`${baseUrl}/put`, putData);

      expect(response.status).toBe(200);
      const data = response.data as any;
      expect(data).toHaveProperty('method', 'PUT');
      expect(data).toHaveProperty('json');
      expect(data.json).toEqual(putData);
    });
  });

  describe('DELETE /delete', () => {
    it('should return request metadata', async () => {
      const response = await axios.delete(`${baseUrl}/delete`, {
        headers: { 'X-Delete-Reason': 'test' }
      });

      expect(response.status).toBe(200);
      const data = response.data as any;
      expect(data).toHaveProperty('method', 'DELETE');
      expect(data.headers).toHaveProperty('x-delete-reason', 'test');
    });
  });

  describe('ANY /anything', () => {
    it('should accept any HTTP method', async () => {
      const response = await axios.post(`${baseUrl}/anything`, { test: 'data' });

      expect(response.status).toBe(200);
      const data = response.data as any;
      expect(data).toHaveProperty('method', 'POST');
      expect(data).toHaveProperty('json');
      expect(data.json).toEqual({ test: 'data' });
    });
  });

  describe('Error handling', () => {
    it('should return 404 for unknown endpoints', async () => {
      try {
        await axios.get(`${baseUrl}/unknown`);
        expect.fail('Should have thrown an error');
      } catch (error: any) {
        expect(error.response?.status).toBe(404);
      }
    });

    it('should handle invalid status codes', async () => {
      try {
        await axios.get(`${baseUrl}/status/abc`);
        expect.fail('Should have thrown an error');
      } catch (error: any) {
        expect(error.response?.status).toBe(400);
      }
    });
  });
}); 