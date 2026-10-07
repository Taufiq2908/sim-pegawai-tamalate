export function ok(res: any, data: unknown, message = 'ok', meta: unknown = null) {
  return res.json({ success: true, message, data, meta, errors: null });
}
export function fail(res: any, status: number, message: string, errors: unknown = null) {
  return res.status(status).json({ success: false, message, data: null, meta: null, errors });
}
