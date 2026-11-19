import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import bcrypt from 'bcryptjs';
import { HydratedDocument } from 'mongoose';

export const ROLES = ['user', 'admin'] as const;
export type Role = (typeof ROLES)[number];

const cleanInterests = (list: unknown[] = []) => [
  ...new Set(list.map((i) => String(i).trim().toLowerCase()).filter(Boolean)),
];

@Schema({
  timestamps: true,
  toJSON: {
    versionKey: false,
    transform: (_doc, ret) => {
      delete (ret as { password?: string }).password;
      delete (ret as { passwordChangedAt?: Date }).passwordChangedAt;
      return ret;
    },
  },
})
export class User {
  @Prop({ required: true, trim: true, maxlength: 80 })
  name: string;

  @Prop({ required: true, trim: true, lowercase: true })
  email: string;

  @Prop({ required: true, minlength: 8, maxlength: 72, select: false })
  password: string;

  @Prop({ type: String, enum: ROLES, default: 'user' })
  role: Role;

  @Prop({ type: [String], default: [], set: cleanInterests })
  interests: string[];

  @Prop()
  passwordChangedAt?: Date;
}

export type UserDocument = HydratedDocument<User>;
export const UserSchema = SchemaFactory.createForClass(User);

UserSchema.index({ email: 1 }, { unique: true });
UserSchema.index({ interests: 1 });

UserSchema.pre('save', async function () {
  if (!this.isModified('password')) return;
  this.password = await bcrypt.hash(this.password, 12);
  if (!this.isNew) this.passwordChangedAt = new Date();
});
