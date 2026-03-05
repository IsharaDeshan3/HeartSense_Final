import mongoose, { Schema, model, models } from "mongoose";

const AccessRequestSchema = new Schema(
  {
    patientId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Patient',
      required: true,
    },
    doctorId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    status: {
      type: String,
      enum: ["pending", "approved", "rejected"],
      default: "pending",
    },
    reason: {
      type: String,
    }
  },
  {
    timestamps: true,
  }
);

const AccessRequest = models.AccessRequest || model("AccessRequest", AccessRequestSchema);

export default AccessRequest;
