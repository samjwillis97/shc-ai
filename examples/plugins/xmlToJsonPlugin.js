/**
 * XML to JSON Plugin for HttpCraft
 * Demonstrates Phase 10 T10.1 post-response hooks:
 * - Converting XML response bodies to JSON format
 * - Transforming response content before further processing
 */

import { parseString } from 'xml2js';

export default {
  async setup(context) {
    // Register post-response hook that converts XML to JSON
    context.registerPostResponseHook(async (request, response) => {
      // Only process if the response appears to be XML
      const contentType = response.headers['content-type'] || '';
      const isXml = contentType.includes('xml') || 
                   contentType.includes('application/xml') ||
                   contentType.includes('text/xml') ||
                   response.body.trim().startsWith('<?xml') ||
                   response.body.trim().startsWith('<');

      if (isXml && context.config.convertXmlToJson !== false) {
        try {
          // Parse XML to JavaScript object using xml2js
          const result = await new Promise((resolve, reject) => {
            parseString(response.body, {
              explicitArray: false,      // Don't force arrays for single elements
              explicitRoot: false,       // Don't wrap in root element
              mergeAttrs: true,          // Merge attributes into element content
              trim: true,                // Trim whitespace
              normalizeTags: context.config.normalizeTags || false, // Normalize tag names
              normalize: context.config.normalize || false,         // Normalize whitespace
              ignoreAttrs: context.config.ignoreAttrs || false     // Ignore attributes
            }, (err, result) => {
              if (err) reject(err);
              else resolve(result);
            });
          });

          // Convert to JSON string and update response body
          response.body = JSON.stringify(result, null, 2);
          
          // Update content-type header to indicate JSON
          response.headers['content-type'] = 'application/json; charset=utf-8';
          response.headers['x-original-content-type'] = contentType;
          response.headers['x-converted-by'] = 'xmlToJsonPlugin';
          response.headers['x-conversion-time'] = new Date().toISOString();
          
          // Add debug information if enabled
          if (context.config.debug) {
            console.log(`[xmlToJsonPlugin] Successfully converted XML to JSON for ${request.url}`);
          }
          
        } catch (error) {
          // If XML parsing fails, add error information but don't modify the body
          response.headers['x-xml-parse-error'] = error.message;
          response.headers['x-conversion-failed'] = 'true';
          
          if (context.config.debug) {
            console.warn(`[xmlToJsonPlugin] Failed to parse XML: ${error.message}`);
          }
          
          // Optionally fail the request if strict mode is enabled
          if (context.config.strictMode) {
            throw new Error(`XML to JSON conversion failed: ${error.message}`);
          }
        }
      }
    });

    // Register variable sources that provide XML conversion utilities
    context.registerVariableSource('isXmlConversionEnabled', () => {
      return context.config.convertXmlToJson !== false ? 'true' : 'false';
    });

    context.registerVariableSource('xmlParserVersion', () => {
      return '2.0.0'; // Updated version with xml2js
    });

    context.registerVariableSource('conversionOptions', () => {
      return JSON.stringify({
        explicitArray: false,
        explicitRoot: false,
        mergeAttrs: true,
        trim: true,
        normalizeTags: context.config.normalizeTags || false,
        normalize: context.config.normalize || false,
        ignoreAttrs: context.config.ignoreAttrs || false
      });
    });
  }
}; 