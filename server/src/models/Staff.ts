import { Schema, model, InferSchemaType } from 'mongoose';

/**
 * One salary record per teacher per work month ("2026-10" = October's salary).
 * It falls due on the institute's pay day in the FOLLOWING month (e.g. 1 Nov), and the
 * owner gets automatic reminders before / on / after that date until it is paid.
 */
const salarySchema = new Schema(
  {
    instituteId: { type: Schema.Types.ObjectId, ref: 'Institute', required: true, index: true },
    teacherId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    month: { type: String, required: true }, // YYYY-MM (the month worked)
    /** Monthly salary at the time the record was made (from the teacher profile). */
    baseAmount: { type: Number, required: true, min: 0 },
    bonus: { type: Number, default: 0, min: 0 },
    deduction: { type: Number, default: 0, min: 0 },
    /** Leave / absent days in the month (half day = 0.5) from staff attendance, and the pay cut for them. */
    leaveDays: { type: Number, default: 0, min: 0 },
    leaveDeduction: { type: Number, default: 0, min: 0 },
    /** baseAmount + bonus − deduction − leaveDeduction. */
    amount: { type: Number, required: true, min: 0 },
    paidAmount: { type: Number, default: 0, min: 0 },
    dueDate: { type: Date, required: true },
    status: { type: String, enum: ['pending', 'partial', 'paid'], default: 'pending' },
    /** True once the owner changed the amounts by hand — later profile salary changes no longer overwrite it. */
    adjusted: { type: Boolean, default: false },
    note: String,
    payments: [
      {
        amount: { type: Number, required: true },
        method: { type: String, enum: ['cash', 'upi', 'bank', 'cheque'], default: 'bank' },
        reference: String,
        note: String,
        paidAt: { type: Date, default: Date.now },
        by: { type: Schema.Types.ObjectId, ref: 'User' },
      },
    ],
    paidAt: Date,
    lastReminderAt: Date,
    reminderCount: { type: Number, default: 0 },
    /** Pay-day notices already sent to the teacher, e.g. "before:2026-11-01", "today:2026-11-01". */
    teacherNotices: [String],
  },
  { timestamps: true },
);
salarySchema.index({ instituteId: 1, teacherId: 1, month: 1 }, { unique: true });
salarySchema.index({ instituteId: 1, status: 1, dueDate: 1 });
salarySchema.index({ instituteId: 1, month: -1 });

export type SalaryT = InferSchemaType<typeof salarySchema>;
export const Salary = model('Salary', salarySchema);

/** Teacher check-in / check-out: one row per teacher per day (times are always taken from the server clock). */
const staffAttendanceSchema = new Schema(
  {
    instituteId: { type: Schema.Types.ObjectId, ref: 'Institute', required: true, index: true },
    teacherId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    date: { type: String, required: true }, // YYYY-MM-DD in the app time zone
    checkIn: Date,
    checkOut: Date,
    /** Worked minutes (set on check-out). */
    minutes: { type: Number, default: 0 },
    late: { type: Boolean, default: false },
    lateBy: { type: Number, default: 0 }, // minutes after start time + grace
    earlyLeave: { type: Boolean, default: false },
    /** 'leave' / 'absent' rows are added by the owner; 'present' comes from a check-in. */
    status: { type: String, enum: ['present', 'leave', 'absent', 'half_day'], default: 'present' },
    checkInNote: String,
    checkOutNote: String,
    checkInGeo: { _id: false, lat: Number, lng: Number, accuracy: Number },
    checkOutGeo: { _id: false, lat: Number, lng: Number, accuracy: Number },
    checkInIp: String,
    checkOutIp: String,
    /** Set when the owner edited / added the row by hand. */
    editedBy: { type: Schema.Types.ObjectId, ref: 'User' },
    editedAt: Date,
    ownerNote: String,
  },
  { timestamps: true },
);
staffAttendanceSchema.index({ instituteId: 1, teacherId: 1, date: 1 }, { unique: true });
staffAttendanceSchema.index({ instituteId: 1, date: 1 });

export type StaffAttendanceT = InferSchemaType<typeof staffAttendanceSchema>;
export const StaffAttendance = model('StaffAttendance', staffAttendanceSchema);

/**
 * A teacher's end-of-day work report: what was taught, tests taken, homework given, anything
 * else — one per teacher per day. The owner reads it and marks it seen (optionally with a reply).
 */
const workReportSchema = new Schema(
  {
    instituteId: { type: Schema.Types.ObjectId, ref: 'Institute', required: true, index: true },
    teacherId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    date: { type: String, required: true }, // YYYY-MM-DD (app time zone)
    /** Classes taken today: batch + topic covered. */
    classes: [{ _id: false, batchId: { type: Schema.Types.ObjectId, ref: 'Batch' }, batchName: String, topic: String }],
    tests: String,
    homework: String,
    otherWork: String,
    issues: String,
    submittedAt: { type: Date, default: Date.now },
    seenAt: Date,
    seenBy: { type: Schema.Types.ObjectId, ref: 'User' },
    seenByName: String,
    ownerComment: String,
  },
  { timestamps: true },
);
workReportSchema.index({ instituteId: 1, teacherId: 1, date: 1 }, { unique: true });
workReportSchema.index({ instituteId: 1, date: -1, _id: -1 });
workReportSchema.index({ instituteId: 1, seenAt: 1 });

export type WorkReportT = InferSchemaType<typeof workReportSchema>;
export const WorkReport = model('WorkReport', workReportSchema);
