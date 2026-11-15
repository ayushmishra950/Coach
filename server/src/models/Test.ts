import { Schema, model, InferSchemaType } from 'mongoose';

const testSchema = new Schema(
  {
    instituteId: { type: Schema.Types.ObjectId, ref: 'Institute', required: true, index: true },
    batchId: { type: Schema.Types.ObjectId, ref: 'Batch', required: true, index: true },
    subject: { type: String, required: true },
    topic: String,
    maxMarks: { type: Number, required: true, min: 1 },
    /** Pass mark as a percentage of maxMarks (default 40%). */
    passPercent: { type: Number, default: 40, min: 0, max: 100 },
    /** Negative marking allowed (JEE/NEET style) — marks may go below zero, down to -maxMarks. */
    negativeMarking: { type: Boolean, default: false },
    date: { type: Date, required: true },
    status: { type: String, enum: ['scheduled', 'graded', 'published'], default: 'scheduled' },
    results: [
      {
        _id: false,
        studentId: { type: Schema.Types.ObjectId, ref: 'Student', required: true },
        marks: { type: Number },
        absent: { type: Boolean, default: false },
        remark: String,
      },
    ],
    /** 'online' = objective (MCQ) test students take in the portal; marks are filled in automatically. */
    mode: { type: String, enum: ['offline', 'online'], default: 'offline' },
    questions: [
      {
        text: { type: String, required: true },
        options: [String],
        correct: { type: Number, required: true }, // index into options
        marks: { type: Number, default: 1 },
        explanation: String,
      },
    ],
    /** Marks taken off for each wrong answer (0 = no negative marking). */
    wrongPenalty: { type: Number, default: 0 },
    durationMins: { type: Number, default: 30 },
    opensAt: Date,
    closesAt: Date,
    /** Show correct answers to students after they submit (only once results are published). */
    showAnswers: { type: Boolean, default: true },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User' },
    publishedAt: Date,
  },
  { timestamps: true },
);

testSchema.index({ instituteId: 1, 'results.studentId': 1, date: -1 });
testSchema.index({ instituteId: 1, 'results.studentId': 1, publishedAt: -1, date: -1, _id: -1 });
testSchema.index({ instituteId: 1, batchId: 1, date: -1, _id: -1 });
testSchema.index({ instituteId: 1, date: -1, _id: -1 });
testSchema.index({ instituteId: 1, status: 1, date: -1 });

export type TestT = InferSchemaType<typeof testSchema>;
export const Test = model('Test', testSchema);
