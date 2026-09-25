import { Schema, model, InferSchemaType, HydratedDocument } from 'mongoose';

export const ROLES = ['superadmin', 'owner', 'teacher', 'parent'] as const;
export type Role = (typeof ROLES)[number];

const userSchema = new Schema(
  {
    name: { type: String, required: true, trim: true },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    password: { type: String, required: true, select: false },
    role: { type: String, enum: ROLES, required: true },
    instituteId: { type: Schema.Types.ObjectId, ref: 'Institute', index: true },
    phone: String,
    // teacher fields
    subjects: [String],
    qualification: String,
    salary: Number,
    joiningDate: Date,
    // parent fields
    studentIds: [{ type: Schema.Types.ObjectId, ref: 'Student' }],
    active: { type: Boolean, default: true },
    lastLoginAt: Date,
  },
  { timestamps: true },
);

export type UserT = InferSchemaType<typeof userSchema>;
export type UserDoc = HydratedDocument<UserT>;
export const User = model('User', userSchema);
