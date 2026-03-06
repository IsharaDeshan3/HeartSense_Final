import mongoose, { Schema, model, models } from "mongoose";

const PatientSchema = new Schema(
  {
    fullName: {
      type: String,
      required: [true, "Full name is required"],
    },
    patientId: {
      type: String,
      required: [true, "National ID or Passport is required"],
      unique: true,
    },
    age: {
      type: Number,
      required: [true, "Age is required"],
    },
    gender: {
      type: String,
      enum: ["male", "female", "other"],
      required: true,
    },
    contact: {
      type: String,
      required: [true, "Contact information is required"],
    },
    // Confidential Medical Data (only accessible by doctors)
    medicalData: {
      clinicalObservations: String,
      symptoms: [String],
      riskFactors: [String],
      diagnosisHistory: [{
        condition: String,
        date: Date,
        doctor: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }
      }],
      confidentialNotes: String,
    },
    // The doctor who originally registered this patient
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    // Doctors who have created or interacted with this patient
    assignedDoctors: [{
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    }],
  },
  {
    timestamps: true,
  }
);

const Patient = models.Patient || model("Patient", PatientSchema);

export default Patient;
