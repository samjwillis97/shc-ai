import { createServer, Server, IncomingMessage, ServerResponse } from 'http';
import { URL } from 'url';
import { AddressInfo } from 'net';

export interface MockServerRequest {
  method: string;
  url: string;
  headers: Record<string, string | string[]>;
  body?: any;
  args: Record<string, string>;
  form?: Record<string, any>;
  files?: Record<string, any>;
  json?: any;
  data?: string;
  origin?: string;
}

export class MockHttpBinServer {
  private server: Server | null = null;
  private port: number = 0;

  constructor() {
    this.server = createServer((req, res) => {
      this.handleRequest(req, res);
    });
  }

  public async start(port: number = 0): Promise<number> {
    return new Promise((resolve, reject) => {
      if (!this.server) {
        reject(new Error('Server not initialized'));
        return;
      }

      this.server.listen(port, () => {
        const address = this.server!.address() as AddressInfo;
        this.port = address.port;
        console.log(`Mock HttpBin server started on port ${this.port}`);
        resolve(this.port);
      });

      this.server.on('error', (err) => {
        reject(err);
      });
    });
  }

  public async stop(): Promise<void> {
    return new Promise((resolve) => {
      if (this.server) {
        this.server.close(() => {
          console.log('Mock HttpBin server stopped');
          resolve();
        });
      } else {
        resolve();
      }
    });
  }

  public getPort(): number {
    return this.port;
  }

  public getBaseUrl(): string {
    return `http://localhost:${this.port}`;
  }

  private async handleRequest(req: IncomingMessage, res: ServerResponse): Promise<void> {
    try {
      const url = new URL(req.url!, `http://localhost:${this.port}`);
      const method = req.method!.toUpperCase();
      const path = url.pathname;

      // Parse query parameters
      const args: Record<string, string> = {};
      url.searchParams.forEach((value, key) => {
        args[key] = value;
      });

      // Read request body
      let body = '';
      req.on('data', chunk => {
        body += chunk.toString();
      });

      req.on('end', () => {
        this.processRequest(req, res, { path, method, body, args });
      });

    } catch (error) {
      this.sendErrorResponse(res, 500, 'Internal Server Error');
    }
  }

  private processRequest(
    req: IncomingMessage,
    res: ServerResponse,
    { path, method, body, args }: { path: string; method: string; body: string; args: Record<string, string> }
  ): void {
    // Build common request object
    const headers: Record<string, string | string[]> = {};
    Object.entries(req.headers).forEach(([key, value]) => {
      if (value !== undefined) {
        headers[key] = value;
      }
    });

    const requestData: MockServerRequest = {
      method,
      url: `http://localhost:${this.port}${path}${Object.keys(args).length ? '?' + new URLSearchParams(args).toString() : ''}`,
      headers,
      args,
      origin: req.socket.remoteAddress || '127.0.0.1'
    };

    // Parse body if present
    if (body) {
      requestData.data = body;
      
      // Try to parse as JSON
      try {
        const jsonBody = JSON.parse(body);
        requestData.json = jsonBody;
      } catch {
        // Not JSON, check if form data
        try {
          const formData = new URLSearchParams(body);
          const form: Record<string, any> = {};
          formData.forEach((value, key) => {
            form[key] = value;
          });
          requestData.form = form;
        } catch {
          // Neither JSON nor form data, keep as string
        }
      }
    }

    // Route to appropriate handler
    if (path === '/get' && method === 'GET') {
      this.handleGet(res, requestData);
    } else if (path === '/post' && method === 'POST') {
      this.handlePost(res, requestData);
    } else if (path === '/put' && method === 'PUT') {
      this.handlePut(res, requestData);
    } else if (path === '/delete' && method === 'DELETE') {
      this.handleDelete(res, requestData);
    } else if (path === '/headers' && method === 'GET') {
      this.handleHeaders(res, requestData);
    } else if (path === '/json' && method === 'GET') {
      this.handleJson(res, requestData);
    } else if (path.startsWith('/status/') && method === 'GET') {
      this.handleStatus(res, path);
    } else if (path === '/anything') {
      this.handleAnything(res, requestData);
    } else {
      this.sendErrorResponse(res, 404, 'Not Found');
    }
  }

  private handleGet(res: ServerResponse, requestData: MockServerRequest): void {
    this.sendJsonResponse(res, 200, requestData);
  }

  private handlePost(res: ServerResponse, requestData: MockServerRequest): void {
    this.sendJsonResponse(res, 200, requestData);
  }

  private handlePut(res: ServerResponse, requestData: MockServerRequest): void {
    this.sendJsonResponse(res, 200, requestData);
  }

  private handleDelete(res: ServerResponse, requestData: MockServerRequest): void {
    this.sendJsonResponse(res, 200, requestData);
  }

  private handleHeaders(res: ServerResponse, requestData: MockServerRequest): void {
    const response = {
      headers: requestData.headers
    };
    this.sendJsonResponse(res, 200, response);
  }

  private handleJson(res: ServerResponse, requestData: MockServerRequest): void {
    // Return the same JSON structure that httpbin.org/json returns
    const jsonData = {
      slideshow: {
        author: "Yours Truly",
        date: "date of publication",
        slides: [
          {
            title: "Wake up to WonderWidgets!",
            type: "all"
          },
          {
            items: [
              "Why <em>WonderWidgets</em> are great",
              "Who <em>buys</em> WonderWidgets"
            ],
            title: "Overview",
            type: "all"
          }
        ],
        title: "Sample Slide Show"
      }
    };
    this.sendJsonResponse(res, 200, jsonData);
  }

  private handleStatus(res: ServerResponse, path: string): void {
    const statusMatch = path.match(/^\/status\/(\d+)$/);
    if (!statusMatch) {
      this.sendErrorResponse(res, 400, 'Invalid status code');
      return;
    }

    const statusCode = parseInt(statusMatch[1], 10);
    if (statusCode < 100 || statusCode > 599) {
      this.sendErrorResponse(res, 400, 'Invalid status code');
      return;
    }

    // For status endpoints, return empty body with the requested status
    res.writeHead(statusCode, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({}));
  }

  private handleAnything(res: ServerResponse, requestData: MockServerRequest): void {
    this.sendJsonResponse(res, 200, requestData);
  }

  private sendJsonResponse(res: ServerResponse, statusCode: number, data: any): void {
    const json = JSON.stringify(data, null, 2);
    res.writeHead(statusCode, {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    });
    res.end(json);
  }

  private sendErrorResponse(res: ServerResponse, statusCode: number, message: string): void {
    res.writeHead(statusCode, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: message }));
  }
}

export default MockHttpBinServer; 