import { Readable } from 'node:stream';
import mongoose, { Types } from 'mongoose';
import type { Response } from 'express';
import { HttpError } from '../utils/http.js';

/**
 * File storage in MongoDB GridFS (bucket "files"): no extra service, works with the embedded
 * database and Atlas alike, and files are included in normal database backups.
 */
export interface FileMeta {
  instituteId: Types.ObjectId;
  uploadedBy?: Types.ObjectId;
  /** Public files (website photos) can be fetched without logging in. */
  public?: boolean;
  purpose?: string;
}

const bucket = () => new mongoose.mongo.GridFSBucket(mongoose.connection.db!, { bucketName: 'files' });

export const MAX_UPLOAD = 40 * 1024 * 1024;

const ALLOWED = [
  /^application\/pdf$/, /^image\/(png|jpe?g|webp|gif)$/, /^video\/(mp4|webm|quicktime)$/, /^audio\/(mpeg|mp4|wav|ogg)$/,
  /^application\/(msword|vnd\.openxmlformats-officedocument\.(wordprocessingml\.document|presentationml\.presentation|spreadsheetml\.sheet)|vnd\.ms-powerpoint|vnd\.ms-excel|zip)$/,
  /^text\/plain$/,
];
export const allowedMime = (m: string) => ALLOWED.some((rx) => rx.test(m));

export async function saveFile(buf: Buffer, name: string, mime: string, meta: FileMeta) {
  if (!buf?.length) throw new HttpError(400, 'The file is empty');
  if (buf.length > MAX_UPLOAD) throw new HttpError(413, `Files can be up to ${MAX_UPLOAD / 1024 / 1024} MB. For long lecture videos paste a YouTube / Drive link instead.`);
  if (!allowedMime(mime)) throw new HttpError(400, 'This file type is not allowed. Upload a PDF, image, Office file, audio or MP4 video.');
  const safeName = name.replace(/[\\/:*?"<>|\r\n]+/g, '_').slice(0, 150) || 'file';
  return new Promise<{ _id: Types.ObjectId; name: string; size: number; mime: string }>((resolve, reject) => {
    const up = bucket().openUploadStream(safeName, { metadata: { ...meta, mime } });
    Readable.from(buf).pipe(up).on('error', reject).on('finish', () => resolve({ _id: up.id as Types.ObjectId, name: safeName, size: buf.length, mime }));
  });
}

export async function fileInfo(id: Types.ObjectId) {
  const [f] = await bucket().find({ _id: id }).limit(1).toArray();
  return f as (typeof f & { metadata?: FileMeta & { mime?: string } }) | undefined;
}

export async function deleteFile(id?: Types.ObjectId | null) {
  if (!id) return;
  await bucket().delete(id).catch(() => undefined);
}

/** Streams a file to the response (inline, so PDFs / images / videos open in the browser). */
export async function sendFile(res: Response, id: Types.ObjectId, check: (meta: FileMeta) => boolean, download = false) {
  const f = await fileInfo(id);
  if (!f || !f.metadata || !check(f.metadata)) throw new HttpError(404, 'File not found');
  res.setHeader('Content-Type', f.metadata.mime || 'application/octet-stream');
  res.setHeader('Content-Length', String(f.length));
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Cache-Control', f.metadata.public ? 'public, max-age=86400' : 'private, max-age=300');
  res.setHeader('Content-Disposition', `${download ? 'attachment' : 'inline'}; filename*=UTF-8''${encodeURIComponent(f.filename)}`);
  bucket().openDownloadStream(id).on('error', () => res.destroy()).pipe(res);
}
