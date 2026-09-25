import { Schema, model, InferSchemaType, HydratedDocument } from 'mongoose';

const batchSchema = new Schema(
  {
    instituteId: { type: Schema.Types.ObjectId, ref: 'Institute', required: true, index: true },
    name: { type: String, required: true, trim: true },
    course: String, // e.g. Class 10, JEE, NEET
    subject: String,
    teacherId: { type: Schema.Types.ObjectId, ref: 'User' },
    days: [{ type: String, enum: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] }],
    startTime: { type: String, default: '17:00' },
    endTime: { type: String, default: '18:00' },
    room: String,
    capacity: Number,
    color: { type: String, default: '#6366f1' },
    active: { type: Boolean, default: true },
  },
  { timestamps: true },
);

export type BatchT = InferSchemaType<typeof batchSchema>;
export type BatchDoc = HydratedDocument<BatchT>;
export const Batch = model('Batch', batchSchema);
