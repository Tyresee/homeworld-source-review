export class HomeServiceError extends Error {
  constructor(status, code, message) { super(message); this.status = status; this.code = code; }
}
export const invalid = message => new HomeServiceError(422, 'invalid_request', message);
export const unavailable = (code = 'storage_unavailable', message = "DisplayText4214, DisplayText4016.") => new HomeServiceError(503, code, message);
export const unauthorized = () => new HomeServiceError(401, 'authentication_required', "DisplayText4215, DisplayText4510.");
export const isRecord = value => !!value && typeof value === 'object' && !Array.isArray(value)
  && [Object.prototype, null].includes(Object.getPrototypeOf(value));
export const exactKeys = (value, keys) => isRecord(value) && Object.keys(value).length === keys.length && keys.every(key => Object.hasOwn(value, key));
export const isStudentId = value => typeof value === 'string' && /^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(value);
export const isIdentity = value => typeof value === 'string' && /^[a-zA-Z0-9._:-]{1,128}$/.test(value);
