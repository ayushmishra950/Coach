import { authDataChanged } from '../utils/cache.js';
import { Schema, model } from 'mongoose';
export const ROLES = ['superadmin', 'owner', 'teacher', 'parent'];
const userSchema = new Schema({
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
    /** Bumped on every password change/reset and "sign out everywhere" — older tokens stop working. */
    tokenVersion: { type: Number, default: 0 },
}, { timestamps: true });
userSchema.index({ instituteId: 1, role: 1, active: 1, name: 1 });
userSchema.index({ studentIds: 1 });
// Drop cached logins / institutes so disables, suspensions and password resets apply at once.
for (const h of ['save', 'updateOne', 'updateMany', 'findOneAndUpdate', 'deleteOne', 'deleteMany', 'findOneAndDelete']) {
    userSchema.post(h, () => authDataChanged());
}
export const User = model('User', userSchema);
