-- OTP remains required unless an account is explicitly configured otherwise.
ALTER TABLE "User" ADD COLUMN "loginOtpRequired" BOOLEAN NOT NULL DEFAULT true;
