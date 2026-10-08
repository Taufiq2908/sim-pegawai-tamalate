import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import authRoutes from './routes/auth.routes';
import leaveRoutes from './routes/leave.routes';
import attendanceRoutes from './routes/attendance.routes';
import letterRoutes from './routes/letter.routes';
import kgbRoutes from './routes/kgb.routes';
import outgoingRoutes from './routes/outgoing.routes';
import notificationRoutes from './routes/notification.routes';
import employeeRoutes from './routes/employee.routes';
import userRoutes from './routes/user.routes';
import { prisma } from './lib/prisma';
import { ok } from './utils/response';

export function createApp() {
  const app = express();
  app.use(helmet());
  app.use(cors());
  app.use(express.json());
  app.use(morgan('dev'));

  app.get('/health', (_req, res) => ok(res, { status: 'ok', time: new Date().toISOString() }));
  app.get('/api/v1/leave-types', async (_req, res) => {
    const items = await prisma.leaveType.findMany({ where: { isActive: true }, orderBy: { code: 'asc' } });
    return res.json({ success: true, message: 'ok', data: items, meta: null, errors: null });
  });

  app.use('/api/v1/auth', authRoutes);
  app.use('/api/v1/leave-requests', leaveRoutes);
  app.use('/api/v1/attendances', attendanceRoutes);
  app.use('/api/v1/letters', letterRoutes);
  app.use('/api/v1/kgb-requests', kgbRoutes);
  app.use('/api/v1/outgoing-letters', outgoingRoutes);
  app.use('/api/v1/notifications', notificationRoutes);
  app.use('/api/v1/employees', employeeRoutes);
  app.use('/api/v1/users', userRoutes);

  // 404 & error handler
  app.use((req, res) => res.status(404).json({ success: false, message: `Not found: ${req.path}`, data: null, meta: null, errors: null }));
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  app.use((err: any, _req: any, res: any, _next: any) => {
    console.error(err);
    return res.status(500).json({ success: false, message: 'Internal server error', data: null, meta: null, errors: null });
  });
  return app;
}
