import { Schema, model, InferSchemaType } from 'mongoose';

/* ───────────── Enquiries / leads (website form, demo booking, walk-in, phone) ───────────── */

export const LEAD_STATUSES = ['new', 'contacted', 'demo_scheduled', 'demo_done', 'converted', 'lost'] as const;
export const LEAD_SOURCES = ['website', 'demo_form', 'walk_in', 'phone', 'whatsapp', 'referral', 'social', 'other'] as const;

const leadSchema = new Schema(
  {
    instituteId: { type: Schema.Types.ObjectId, ref: 'Institute', required: true, index: true },
    name: { type: String, required: true, trim: true }, // parent / enquirer
    studentName: { type: String, trim: true },
    phone: { type: String, required: true, trim: true },
    email: { type: String, lowercase: true, trim: true },
    studentClass: String, // e.g. "Class 10"
    courseId: { type: Schema.Types.ObjectId, ref: 'Course' },
    courseName: String,
    message: String,
    source: { type: String, enum: LEAD_SOURCES, default: 'other' },
    /** 'demo' = asked for a free demo class. */
    kind: { type: String, enum: ['enquiry', 'demo'], default: 'enquiry' },
    demoAt: Date,
    demoBatchId: { type: Schema.Types.ObjectId, ref: 'Batch' },
    status: { type: String, enum: LEAD_STATUSES, default: 'new' },
    followUpAt: Date,
    lostReason: String,
    studentId: { type: Schema.Types.ObjectId, ref: 'Student' },
    convertedAt: Date,
    notes: [{ text: String, by: String, at: { type: Date, default: Date.now } }],
    lastContactAt: Date,
  },
  { timestamps: true },
);
leadSchema.index({ instituteId: 1, status: 1, createdAt: -1 });
leadSchema.index({ instituteId: 1, followUpAt: 1 });
leadSchema.index({ instituteId: 1, phone: 1 });
export type LeadT = InferSchemaType<typeof leadSchema>;
export const Lead = model('Lead', leadSchema);

/* ───────────── Courses (shown on the public website, used for leads) ───────────── */

const courseSchema = new Schema(
  {
    instituteId: { type: Schema.Types.ObjectId, ref: 'Institute', required: true, index: true },
    name: { type: String, required: true, trim: true },
    category: String, // e.g. "Class 9–10", "JEE", "NEET"
    description: String,
    duration: String, // e.g. "12 months"
    fee: Number,
    feeNote: String, // e.g. "per year, 3 installments"
    syllabus: [String],
    highlights: [String],
    batchIds: [{ type: Schema.Types.ObjectId, ref: 'Batch' }],
    public: { type: Boolean, default: true },
    active: { type: Boolean, default: true },
    order: { type: Number, default: 0 },
  },
  { timestamps: true },
);
courseSchema.index({ instituteId: 1, active: 1, order: 1 });
export type CourseT = InferSchemaType<typeof courseSchema>;
export const Course = model('Course', courseSchema);

/* ───────────── Study material: notes (PDF), recorded lectures, assignments, links ───────────── */

const materialSchema = new Schema(
  {
    instituteId: { type: Schema.Types.ObjectId, ref: 'Institute', required: true, index: true },
    batchIds: [{ type: Schema.Types.ObjectId, ref: 'Batch' }],
    title: { type: String, required: true, trim: true },
    description: String,
    subject: String,
    kind: { type: String, enum: ['notes', 'video', 'assignment', 'link'], default: 'notes' },
    fileId: { type: Schema.Types.ObjectId },
    fileName: String,
    fileSize: Number,
    mime: String,
    url: String, // YouTube / Drive / any link
    dueDate: Date, // assignments
    uploadedBy: { type: Schema.Types.ObjectId, ref: 'User' },
    uploadedByName: String,
  },
  { timestamps: true },
);
materialSchema.index({ instituteId: 1, batchIds: 1, createdAt: -1 });
export type MaterialT = InferSchemaType<typeof materialSchema>;
export const Material = model('Material', materialSchema);

/* ───────────── Leave requests from parents ───────────── */

const leaveSchema = new Schema(
  {
    instituteId: { type: Schema.Types.ObjectId, ref: 'Institute', required: true, index: true },
    studentId: { type: Schema.Types.ObjectId, ref: 'Student', required: true },
    parentUserId: { type: Schema.Types.ObjectId, ref: 'User' },
    from: { type: String, required: true }, // YYYY-MM-DD
    to: { type: String, required: true },
    reason: { type: String, required: true },
    status: { type: String, enum: ['pending', 'approved', 'rejected', 'cancelled'], default: 'pending' },
    reviewedBy: { type: Schema.Types.ObjectId, ref: 'User' },
    reviewedByName: String,
    reviewNote: String,
    reviewedAt: Date,
  },
  { timestamps: true },
);
leaveSchema.index({ instituteId: 1, status: 1, createdAt: -1 });
leaveSchema.index({ instituteId: 1, studentId: 1, from: -1 });
export type LeaveT = InferSchemaType<typeof leaveSchema>;
export const LeaveRequest = model('LeaveRequest', leaveSchema);

/* ───────────── Online test attempts ───────────── */

const attemptSchema = new Schema(
  {
    instituteId: { type: Schema.Types.ObjectId, ref: 'Institute', required: true, index: true },
    testId: { type: Schema.Types.ObjectId, ref: 'Test', required: true },
    studentId: { type: Schema.Types.ObjectId, ref: 'Student', required: true },
    startedAt: { type: Date, default: Date.now },
    /** Server-side deadline (start + duration, capped at the test window end). */
    deadline: Date,
    submittedAt: Date,
    answers: [{ type: Number, default: null }], // option index per question, null = skipped
    correct: Number,
    wrong: Number,
    score: Number,
  },
  { timestamps: true },
);
attemptSchema.index({ testId: 1, studentId: 1 }, { unique: true });
export type AttemptT = InferSchemaType<typeof attemptSchema>;
export const TestAttempt = model('TestAttempt', attemptSchema);
