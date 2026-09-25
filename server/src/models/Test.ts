import { Schema, model, InferSchemaType } from 'mongoose';

const testSchema = new Schema(
  {
    instituteId: { type: Schema.Types.ObjectId, ref: 'Institute', required: true, index: true },
    batchId: { type: Schema.Types.ObjectId, ref: 'Batch', required: true, index: true },
    subject: { type: String, required: true },
    topic: String,
    maxMarks: { type: Number, required: true, min: 1 },
    date: { type: Date, required: true },
    status: { type: String, enum: ['scheduled', 'graded', 'published'], default: 'scheduled' },
    results: [
      {
        _id: false,
        studentId: { type: Schema.Types.ObjectId, ref: 'Student', required: true },
        marks: { type: Number, min: 0 },
        absent: { type: Boolean, default: false },
        remark: String,
      },
    ],
    createdBy: { type: Schema.Types.ObjectId, ref: 'User' },
    publishedAt: Date,
  },
  { timestamps: true },
);

export type TestT = InferSchemaType<typeof testSchema>;
export const Test = model('Test', testSchema);
