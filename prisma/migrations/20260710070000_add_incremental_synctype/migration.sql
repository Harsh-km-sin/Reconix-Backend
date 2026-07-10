-- Add INCREMENTAL to the SyncType enum (additive, non-destructive).
ALTER TYPE "SyncType" ADD VALUE IF NOT EXISTS 'INCREMENTAL';
