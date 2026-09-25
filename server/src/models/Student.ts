import { Schema, model, InferSchemaType, HydratedDocument } from 'mongoose';

const studentSchema = new Schema(
  {
    instituteId: { type: Schema.Types.ObjectId, ref: 'Institute', required: true, index: true },
    studentCode: { type: String, required: true },
    name: { type: String, required: true, trim: true },
    phone: String,
    dob: Date,
    gender: { type: String, enum: ['male', 'female', 'other'] },
    address: String,
    parentName: String,
    parentPhone: String,
    parentEmail: { type: String, lowercase: true, trim: true },
    course: String,
    batchIds: [{ type: Schema.Types.ObjectId, ref: 'Batch' }],
    joiningDate: { type: Date, default: Date.now },
    status: { type: String, enum: ['active', 'inactive'], default: 'active' },
    parentUserId: { type: Schema.Types.ObjectId, ref: 'User' },
    notes: [
      {
        text: String,
        by: String,
        at: { type: Date, default: Date.now },
      },
    ],
  },
  { timestamps: true },
);
studentSchema.index({ instituteId: 1, studentCode: 1 }, { unique: true });

export type StudentT = InferSchemaType<typeof studentSchema>;
export type StudentDoc = HydratedDocument<StudentT>;
export const Student = model('Student', studentSchema);
