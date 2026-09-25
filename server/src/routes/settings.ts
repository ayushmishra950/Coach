import { Router } from 'express';
import { allow, auth } from '../middleware/auth.js';
import { hasFeature } from '../services/plan.js';
import { HttpError, ah } from '../utils/http.js';
import { AuditLog } from '../models/index.js';

const r = Router();
r.use(auth, allow('owner'));

r.get('/', ah(async (req, res) => res.json(req.institute)));

r.put(
  '/',
  ah(async (req, res) => {
    const inst = req.institute!;
    const b = req.body ?? {};
    for (const k of ['name', 'phone', 'email', 'address', 'city', 'type', 'logoText'] as const) if (b[k] !== undefined) inst.set(k, b[k]);
    if (b.brandColor && b.brandColor !== inst.brandColor) {
      if (!(await hasFeature(inst, 'customBranding'))) throw new HttpError(402, 'Custom branding is a Premium feature', 'UPGRADE_REQUIRED', { feature: 'customBranding' });
      inst.brandColor = b.brandColor;
    }
    if (b.settings) {
      const s = b.settings;
      if (s.channels) {
        if (s.channels.whatsapp && !inst.settings?.channels?.whatsapp && !(await hasFeature(inst, 'whatsapp'))) {
          throw new HttpError(402, 'WhatsApp notifications need the Growth or Premium plan', 'UPGRADE_REQUIRED', { feature: 'whatsapp' });
        }
        for (const c of ['whatsapp', 'email', 'sms'] as const) if (typeof s.channels[c] === 'boolean') inst.set(`settings.channels.${c}`, s.channels[c]);
      }
      if (s.reminders) {
        for (const k of ['enabled', 'onDueDate'] as const) if (typeof s.reminders[k] === 'boolean') inst.set(`settings.reminders.${k}`, s.reminders[k]);
        for (const k of ['daysBefore', 'daysAfter'] as const) if (s.reminders[k] !== undefined) inst.set(`settings.reminders.${k}`, Math.max(0, Math.min(30, Number(s.reminders[k]))));
      }
      if (s.absentAlertAfter !== undefined) inst.set('settings.absentAlertAfter', Math.max(2, Math.min(10, Number(s.absentAlertAfter))));
      if (typeof s.notifyParentOnAbsence === 'boolean') inst.set('settings.notifyParentOnAbsence', s.notifyParentOnAbsence);
    }
    await inst.save();
    await AuditLog.create({ instituteId: inst._id, userId: req.user.id, userName: req.user.name, action: 'settings.update', entity: 'institute', entityId: String(inst._id) });
    res.json(inst);
  }),
);

export default r;
