import { logger } from "../../azure-functions/monitor/winstonLogger";
import { getPool } from "../../config/database";
import crypto from 'crypto';
import sql from "mssql";


export class IdempotencyService {

  async checkIdempotency(
    lawFirm: string,
    idempotencyKey: string,
    method: string,
    path: string,
    requestBody: any
  ): Promise<{ exists: boolean; response?: any }> {
    try {
      const pool = getPool();
      const requestHash = crypto.createHash('sha256').update(JSON.stringify(requestBody)).digest('hex');

      const result = await pool.request()
        .input('law_firm', sql.VarChar(75), lawFirm)
        .input('idempotency_key', sql.UniqueIdentifier, idempotencyKey)
        .query(`
          SELECT response_status, response_body, method, path, request_hash
          FROM idempotency_records
          WHERE law_firm = @law_firm AND idempotency_key = @idempotency_key
          AND expires_at > GETUTCDATE()
        `);

      if (result.recordset.length === 0) {
        return { exists: false };
      }

      const record = result.recordset[0];

      // Verify method and path match
      if (record.method !== method || record.path !== path) {
        throw new Error('Idempotency key used with different method/path');
      }

      // Verify request body hasn't changed
      if (record.request_hash !== requestHash) {
        throw new Error('Idempotency key used with different request body');
      }

      return {
        exists: true,
        response: {
          status: record.response_status,
          body: JSON.parse(record.response_body),
        },
      };
    } catch (error) {
      logger.error('Idempotency check error', { error, idempotencyKey });
      throw error;
    }
  }

  async storeIdempotencyRecord(
    lawFirm: string,
    idempotencyKey: string,
    method: string,
    path: string,
    requestBody: any,
    responseStatus: number,
    responseBody: any,
    ttlHours: number = 24
  ): Promise<void> {
    try {
      const pool = getPool();
      const requestHash = crypto.createHash('sha256').update(JSON.stringify(requestBody)).digest('hex');
      const expiresAt = new Date(Date.now() + ttlHours * 60 * 60 * 1000);

      await pool.request()
        .input('law_firm', sql.VarChar(75), lawFirm)
        .input('idempotency_key', sql.UniqueIdentifier, idempotencyKey)
        .input('method', sql.VarChar(10), method)
        .input('path', sql.VarChar(500), path)
        .input('request_hash', sql.VarChar(64), requestHash)
        .input('response_status', sql.Int, responseStatus)
        .input('response_body', sql.NVarChar(sql.MAX), JSON.stringify(responseBody))
        .input('expires_at', sql.DateTime2, expiresAt)
        .query(`
          INSERT INTO idempotency_records (
            law_firm, idempotency_key, method, path, request_hash,
            response_status, response_body, expires_at
          ) VALUES (
            @law_firm, @idempotency_key, @method, @path, @request_hash,
            @response_status, @response_body, @expires_at
          )
        `);

      logger.info('Idempotency record stored', { idempotencyKey, lawFirm });
    } catch (error) {
      logger.error('Failed to store idempotency record', { error, idempotencyKey });
    }
  }
}