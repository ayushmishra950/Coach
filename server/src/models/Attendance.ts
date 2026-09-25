import { Schema, model, InferSchemaType } from 'mongoose';

const attendanceSchema = new Schema(
  {
    instituteId: { type: Schema.Types.ObjectId, ref: 'Institute', required: true, index: true },
    batchId: { type: Schema.Types.ObjectId, ref: 'Batch', required: true },
    date: { type: String, required: true }, // YYYY-MM-DD
    records: [
      {
        _id: false,
        studentId: { type: Schema.Types.ObjectId, ref: 'Student', required: true },
        status: { type: String, enum: ['present', 'absent', 'late'], required: true },
      },
    ],
    markedBy: { type: Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true },
);
attendanceSchema.index({ batchId: 1, date: 1 }, { unique: true });
attendanceSchema.index({ instituteId: 1, date: 1 });

export type AttendanceT = InferSchemaType<typeof attendanceSchema>;
export const Attendance = model('Attendance', attendanceSchema);
