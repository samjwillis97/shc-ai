/**
 * Test suite for binary data handling in HttpCraft
 * Tests T16.1-T16.10: Binary data support across the entire system
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { BinaryDetector } from '../../src/core/binaryDetector.js';
import { httpClient } from '../../src/core/httpClient.js';
import type { HttpResponse } from '../../src/types/plugin.js';
import axios from 'axios';

// Mock axios
vi.mock('axios');
const mockedAxios = vi.mocked(axios);

describe('Binary Data Handling', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('BinaryDetector (T16.4)', () => {
    describe('isBinaryContentType', () => {
      it('should detect binary MIME types correctly', () => {
        // Archives
        expect(BinaryDetector.isBinaryContentType('application/zip')).toBe(true);
        expect(BinaryDetector.isBinaryContentType('application/x-rar-compressed')).toBe(true);
        expect(BinaryDetector.isBinaryContentType('application/gzip')).toBe(true);

        // Documents
        expect(BinaryDetector.isBinaryContentType('application/pdf')).toBe(true);
        expect(BinaryDetector.isBinaryContentType('application/msword')).toBe(true);

        // Images (all subtypes)
        expect(BinaryDetector.isBinaryContentType('image/png')).toBe(true);
        expect(BinaryDetector.isBinaryContentType('image/jpeg')).toBe(true);
        expect(BinaryDetector.isBinaryContentType('image/gif')).toBe(true);

        // Audio/Video (all subtypes)
        expect(BinaryDetector.isBinaryContentType('audio/mp3')).toBe(true);
        expect(BinaryDetector.isBinaryContentType('video/mp4')).toBe(true);

        // Generic binary
        expect(BinaryDetector.isBinaryContentType('application/octet-stream')).toBe(true);

        // Text types should return false
        expect(BinaryDetector.isBinaryContentType('text/plain')).toBe(false);
        expect(BinaryDetector.isBinaryContentType('application/json')).toBe(false);
        expect(BinaryDetector.isBinaryContentType('text/html')).toBe(false);
        expect(BinaryDetector.isBinaryContentType('application/xml')).toBe(false);
      });

      it('should handle Content-Type with charset parameters', () => {
        expect(BinaryDetector.isBinaryContentType('application/zip; charset=utf-8')).toBe(true);
        expect(BinaryDetector.isBinaryContentType('text/plain; charset=utf-8')).toBe(false);
      });

      it('should handle empty or undefined content types', () => {
        expect(BinaryDetector.isBinaryContentType('')).toBe(false);
        expect(BinaryDetector.isBinaryContentType(undefined as unknown as string)).toBe(false);
      });
    });

    describe('shouldTreatAsBinary', () => {
      it('should detect binary content from Content-Type header', () => {
        const headers = { 'content-type': 'application/zip' };
        expect(BinaryDetector.shouldTreatAsBinary(headers, new ArrayBuffer(8))).toBe(true);
      });

      it('should detect binary content from Content-Disposition attachment', () => {
        const headers = {
          'content-type': 'application/octet-stream',
          'content-disposition': 'attachment; filename="file.zip"',
        };
        expect(BinaryDetector.shouldTreatAsBinary(headers, new ArrayBuffer(8))).toBe(true);
      });

      it('should detect binary content from Buffer data', () => {
        const headers = {};
        const data = Buffer.from([0x50, 0x4b, 0x03, 0x04]); // ZIP header
        expect(BinaryDetector.shouldTreatAsBinary(headers, data)).toBe(true);
      });

      it('should detect binary content from ArrayBuffer data', () => {
        const headers = {};
        const data = new ArrayBuffer(8);
        expect(BinaryDetector.shouldTreatAsBinary(headers, data)).toBe(true);
      });

      it('should default to text for unknown types', () => {
        const headers = { 'content-type': 'text/plain' };
        const data = 'hello world';
        expect(BinaryDetector.shouldTreatAsBinary(headers, data)).toBe(false);
      });
    });

    describe('detectTextEncoding', () => {
      it('should detect UTF-8 encoding', () => {
        expect(BinaryDetector.detectTextEncoding('text/plain; charset=utf-8')).toBe('utf8');
        expect(BinaryDetector.detectTextEncoding('application/json; charset=UTF-8')).toBe('utf8');
      });

      it('should detect latin1 encoding', () => {
        expect(BinaryDetector.detectTextEncoding('text/plain; charset=iso-8859-1')).toBe('latin1');
        expect(BinaryDetector.detectTextEncoding('text/html; charset=latin1')).toBe('latin1');
      });

      it('should default to utf8 for unknown charsets', () => {
        expect(BinaryDetector.detectTextEncoding('text/plain; charset=unknown')).toBe('utf8');
        expect(BinaryDetector.detectTextEncoding('text/plain')).toBe('utf8');
        expect(BinaryDetector.detectTextEncoding()).toBe('utf8');
      });
    });

    describe('formatSize', () => {
      it('should format byte sizes correctly', () => {
        expect(BinaryDetector.formatSize(0)).toBe('0 bytes');
        expect(BinaryDetector.formatSize(512)).toBe('512 bytes');
        expect(BinaryDetector.formatSize(1024)).toBe('1.0 KB');
        expect(BinaryDetector.formatSize(1536)).toBe('1.5 KB');
        expect(BinaryDetector.formatSize(1048576)).toBe('1.0 MB');
        expect(BinaryDetector.formatSize(1073741824)).toBe('1.0 GB');
      });
    });
  });

  describe('HttpClient Binary Support (T16.2)', () => {
    it('should preserve binary data as Buffer', async () => {
      // Mock binary response data (ZIP file header)
      const binaryData = new ArrayBuffer(4);
      const view = new Uint8Array(binaryData);
      view[0] = 0x50; // P
      view[1] = 0x4b; // K
      view[2] = 0x03;
      view[3] = 0x04;

      mockedAxios.mockResolvedValue({
        status: 200,
        statusText: 'OK',
        headers: {
          'content-type': 'application/zip',
          'content-length': '4',
        },
        data: binaryData,
        config: {},
        request: {},
      } as any);

      const response = await httpClient.executeRequest({
        url: 'https://example.com/file.zip',
        method: 'GET',
        headers: {},
      });

      expect(response.isBinary).toBe(true);
      expect(response.contentType).toBe('application/zip');
      expect(response.contentLength).toBe(4);
      expect(Buffer.isBuffer(response.body)).toBe(true);
      expect((response.body as Buffer).length).toBe(4);
    });

    it('should preserve text data as string', async () => {
      const textData = new ArrayBuffer(13);
      const view = new Uint8Array(textData);
      const text = 'Hello, world!';
      for (let i = 0; i < text.length; i++) {
        view[i] = text.charCodeAt(i);
      }

      mockedAxios.mockResolvedValue({
        status: 200,
        statusText: 'OK',
        headers: {
          'content-type': 'text/plain; charset=utf-8',
        },
        data: textData,
        config: {},
        request: {},
      } as unknown);

      const response = await httpClient.executeRequest({
        url: 'https://example.com/text.txt',
        method: 'GET',
        headers: {},
      });

      expect(response.isBinary).toBe(false);
      expect(response.contentType).toBe('text/plain; charset=utf-8');
      expect(typeof response.body).toBe('string');
      expect(response.body).toBe('Hello, world!');
    });

    it('should handle JSON responses correctly', async () => {
      const jsonData = { message: 'Hello', value: 42 };
      const jsonString = JSON.stringify(jsonData);
      const textData = new ArrayBuffer(jsonString.length);
      const view = new Uint8Array(textData);
      for (let i = 0; i < jsonString.length; i++) {
        view[i] = jsonString.charCodeAt(i);
      }

      mockedAxios.mockResolvedValue({
        status: 200,
        statusText: 'OK',
        headers: {
          'content-type': 'application/json',
        },
        data: textData,
      });

      const response = await httpClient.executeRequest({
        url: 'https://example.com/api/data',
        method: 'GET',
        headers: {},
      });

      expect(response.isBinary).toBe(false);
      expect(response.contentType).toBe('application/json');
      expect(typeof response.body).toBe('string');
      expect(JSON.parse(response.body as string)).toEqual(jsonData);
    });
  });

  describe('Binary Response Interface (T16.1)', () => {
    it('should have all required properties for binary responses', () => {
      const binaryResponse: HttpResponse = {
        status: 200,
        statusText: 'OK',
        headers: { 'content-type': 'application/zip' },
        body: Buffer.from([0x50, 0x4b, 0x03, 0x04]),
        isBinary: true,
        contentType: 'application/zip',
        contentLength: 4,
      };

      expect(binaryResponse.status).toBe(200);
      expect(binaryResponse.statusText).toBe('OK');
      expect(binaryResponse.headers).toEqual({ 'content-type': 'application/zip' });
      expect(Buffer.isBuffer(binaryResponse.body)).toBe(true);
      expect(binaryResponse.isBinary).toBe(true);
      expect(binaryResponse.contentType).toBe('application/zip');
      expect(binaryResponse.contentLength).toBe(4);
    });

    it('should have all required properties for text responses', () => {
      const textResponse: HttpResponse = {
        status: 200,
        statusText: 'OK',
        headers: { 'content-type': 'application/json' },
        body: '{"message": "hello"}',
        isBinary: false,
        contentType: 'application/json',
      };

      expect(textResponse.status).toBe(200);
      expect(textResponse.statusText).toBe('OK');
      expect(textResponse.headers).toEqual({ 'content-type': 'application/json' });
      expect(typeof textResponse.body).toBe('string');
      expect(textResponse.isBinary).toBe(false);
      expect(textResponse.contentType).toBe('application/json');
      expect(textResponse.contentLength).toBeUndefined();
    });
  });

  describe('Common Binary File Types', () => {
    const binaryFileTypes = [
      { mime: 'application/zip', ext: 'zip', description: 'ZIP archive' },
      { mime: 'application/pdf', ext: 'pdf', description: 'PDF document' },
      { mime: 'image/png', ext: 'png', description: 'PNG image' },
      { mime: 'image/jpeg', ext: 'jpg', description: 'JPEG image' },
      { mime: 'audio/mpeg', ext: 'mp3', description: 'MP3 audio' },
      { mime: 'video/mp4', ext: 'mp4', description: 'MP4 video' },
      {
        mime: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        ext: 'docx',
        description: 'Word document',
      },
      {
        mime: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        ext: 'xlsx',
        description: 'Excel spreadsheet',
      },
    ];

    binaryFileTypes.forEach(({ mime, ext, description }) => {
      it(`should detect ${description} (${ext}) as binary`, () => {
        expect(BinaryDetector.isBinaryContentType(mime)).toBe(true);
      });
    });
  });

  describe('Edge Cases', () => {
    it('should handle case-insensitive header lookups', () => {
      const headers = { 'Content-Type': 'application/zip' };
      expect(BinaryDetector.shouldTreatAsBinary(headers, new ArrayBuffer(8))).toBe(true);
    });

    it('should handle mixed case content types', () => {
      expect(BinaryDetector.isBinaryContentType('Application/ZIP')).toBe(true);
      expect(BinaryDetector.isBinaryContentType('Image/PNG')).toBe(true);
    });

    it('should handle content types with additional parameters', () => {
      expect(BinaryDetector.isBinaryContentType('application/zip; boundary=something')).toBe(true);
      expect(BinaryDetector.isBinaryContentType('image/png; quality=high')).toBe(true);
    });
  });
});
