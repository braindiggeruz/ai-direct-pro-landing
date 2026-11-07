import { DocumentError, MAX_PAYLOAD_BYTES, MAX_PDF_BYTES } from './schema.mjs';

export class ApiError extends Error {
  constructor(status = 0) { super('document_api_error'); this.status = status; }
}
export function createApiClient(config, fetchImpl = fetch) {
  async function request(path, body, extraHeaders = {}, signal) {
    const timeout = AbortSignal.timeout(15000);
    const response = await fetchImpl(`${config.apiBase}/api/internal/documents${path}`, {
      method: 'POST', redirect: 'error', credentials: 'omit',
      headers: { authorization: `Bearer ${config.secret}`, 'content-type': 'application/json', ...extraHeaders },
      body, signal: signal ? AbortSignal.any([signal, timeout]) : timeout,
    });
    if (!response.ok) { await response.body?.cancel(); throw new ApiError(response.status); }
    const reader = response.body?.getReader();
    if (!reader) throw new ApiError();
    const chunks = []; let size = 0;
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > MAX_PAYLOAD_BYTES + 16384) { await reader.cancel(); throw new ApiError(); }
      chunks.push(value);
    }
    try { return JSON.parse(Buffer.concat(chunks).toString('utf8')); } catch { throw new ApiError(); }
  }
  return {
    async claim(signal) {
      const result = await request('/claim', '{}', {}, signal);
      if (result.ok !== true || !Object.hasOwn(result, 'job')) throw new ApiError();
      return result.job;
    },
    async complete(job, pdf, signal) {
      if (!Buffer.isBuffer(pdf) || pdf.length > MAX_PDF_BYTES || pdf.subarray(0, 5).toString() !== '%PDF-') throw new DocumentError('invalid_pdf');
      const result = await request(`/${encodeURIComponent(job.id)}/complete`, pdf, { 'content-type': 'application/pdf', 'x-document-lease': job.leaseToken }, signal);
      if (result.ok !== true || result.status !== 'ready') throw new ApiError();
    },
    async fail(job, reason) {
      if (!['invalid_payload', 'render_failed', 'timeout'].includes(reason)) throw new DocumentError('invalid_config');
      await request(`/${encodeURIComponent(job.id)}/fail`, JSON.stringify({ reason }), { 'x-document-lease': job.leaseToken });
    },
    async maintenance(cursor, signal) {
      const result = await request('/maintenance', JSON.stringify(cursor ? { cursor } : {}), {}, signal);
      if (result.ok !== true || !(result.cursor === null || (typeof result.cursor === 'string' && result.cursor.length <= 2048)) ||
          !Number.isInteger(result.expired) || result.expired < 0 || !Number.isInteger(result.orphanObjectsDeleted) || result.orphanObjectsDeleted < 0) throw new ApiError();
      return result;
    },
  };
}
