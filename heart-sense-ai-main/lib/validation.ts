/**
 * Validates Sri Lankan National Identity Card (NIC) numbers.
 * Supports both old (9 digits + V/X) and new (12 digits) formats.
 */
export function validateSriLankanNIC(nic: string): boolean {
  const oldNICRegex = /^[0-9]{9}[vVxX]$/;
  const newNICRegex = /^[0-9]{12}$/;
  
  return oldNICRegex.test(nic) || newNICRegex.test(nic);
}

/**
 * Validates Passport numbers (basic format check).
 * Usually 1-2 letters followed by 7-8 digits.
 */
export function validatePassport(passport: string): boolean {
  const passportRegex = /^[A-Z0-9]{6,12}$/i;
  return passportRegex.test(passport);
}

/**
 * General Patient ID validation.
 * Checks if it's either a valid NIC or a valid Passport.
 */
export function validatePatientId(id: string): { isValid: boolean; type: 'NIC' | 'Passport' | 'Invalid' } {
  if (validateSriLankanNIC(id)) return { isValid: true, type: 'NIC' };
  if (validatePassport(id)) return { isValid: true, type: 'Passport' };
  return { isValid: false, type: 'Invalid' };
}
